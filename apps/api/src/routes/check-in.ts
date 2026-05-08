import { Router } from 'express';
import { eq, and, desc, gte, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { checkInSchema } from '@damga/shared';
import { computeTrustScore, computeEvidenceHash } from '@damga/verification';
import { getDb, attendanceEvents, locations, users, orgs } from '@damga/db';
import { env } from '../config/env';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole, requireScope } from '../middleware/auth';
import { checkInLimiter } from '../middleware/rate-limit';
import { logger } from '../config/logger';
import { dispatchWebhook } from '../modules/webhook-delivery';
import { uploadSelfie } from '../lib/storage';
import { awardXp, computeOnTimeBonus } from '../lib/xp';

export const checkInRouter = Router();

/** Aynı kullanıcının çift damga atmasını engelle (proxy/replay attack) */
const VELOCITY_WINDOW_MS = 30 * 1000; // 30 saniye

/** Anomali sebep kodları → kullanıcıya gösterilecek TR mesaj */
const REVIEW_REASON_MESSAGES: Record<string, string> = {
  no_gps: 'Konum (GPS) bilgin alınamadı',
  out_of_geofence: 'Ofis konumunun dışındasın',
  low_gps_accuracy: 'GPS doğruluğu düşük',
  unknown_device: 'Tanınmayan cihaz',
  wrong_wifi: 'Şirket Wi-Fi ağında değilsin',
};

/** İki nokta arası metre cinsinden mesafe (Haversine formülü) */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius m
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * POST /v1/check-in   ve   /v1/check-out
 * Trust score hesaplar, evidence hash + hash chain ile event'i ekler.
 */
async function performAttendance(
  type: 'check_in' | 'check_out',
  req: import('express').Request,
  res: import('express').Response,
) {
  if (!req.authUserId || !req.authOrgId) {
    throw new HttpError(401, 'Yetki yok');
  }
  const input = checkInSchema.parse(req.body);
  const db = getDb();

  // Lokasyon getir (location_id verildiyse veya kullanıcının org'undaki tek lokasyon)
  let location: typeof locations.$inferSelect | null = null;
  if (input.location_id) {
    const [loc] = await db
      .select()
      .from(locations)
      .where(and(eq(locations.id, input.location_id), eq(locations.org_id, req.authOrgId)));
    location = loc ?? null;
  } else {
    const allLocs = await db.select().from(locations).where(eq(locations.org_id, req.authOrgId));
    if (allLocs.length === 1) location = allLocs[0]!;
  }

  if (!location) {
    throw new HttpError(404, 'Lokasyon bulunamadı veya seçilmedi', 'LOCATION_REQUIRED');
  }

  // ============================================================
  //  ANOMALI TESPİTİ + SELFIE FALLBACK (proxy + lokasyon doğrulama)
  // ============================================================

  // 1) Velocity check: aynı kullanıcı 30sn içinde tekrar damga atıyorsa reject
  const velocityCutoff = new Date(Date.now() - VELOCITY_WINDOW_MS);
  const [recentEvent] = await db
    .select({ id: attendanceEvents.id, server_time: attendanceEvents.server_time })
    .from(attendanceEvents)
    .where(
      and(
        eq(attendanceEvents.user_id, req.authUserId),
        gte(attendanceEvents.server_time, velocityCutoff),
      ),
    )
    .orderBy(desc(attendanceEvents.server_time))
    .limit(1);
  if (recentEvent) {
    throw new HttpError(
      429,
      'Çok hızlı tekrar denedin — son damgadan en az 30 saniye sonra tekrar dene.',
      'VELOCITY_BLOCKED',
    );
  }

  // 2) Org settings — allow_outside_geofence true ise lokasyon kontrolü yumuşak
  // auto_selfie_every_stamp true ise her damga'da selfie istenir (kanıt amaçlı)
  const [orgRow] = await db
    .select({ settings: orgs.settings })
    .from(orgs)
    .where(eq(orgs.id, req.authOrgId));
  const allowOutside = !!orgRow?.settings?.allow_outside_geofence;
  const autoSelfieEveryStamp = !!orgRow?.settings?.auto_selfie_every_stamp;

  // 3) Anomali tespiti — NFC fiziksel temas hariç tüm damga'lar için lokasyon ZORUNLU
  // Anomali bulunursa "selfie + yönetici onayı" akışına geçilir (eski hard reject yerine).
  const usingNfc = !!input.nfc_tag_id;
  const reviewReasons: string[] = [];

  if (!usingNfc && !allowOutside) {
    if (input.latitude == null || input.longitude == null) {
      reviewReasons.push('no_gps');
    } else {
      const distM = haversineMeters(
        input.latitude,
        input.longitude,
        location.latitude,
        location.longitude,
      );
      if (distM > location.geofence_radius_m) {
        reviewReasons.push('out_of_geofence');
      }
      if (input.gps_accuracy_m != null && input.gps_accuracy_m > 200) {
        reviewReasons.push('low_gps_accuracy');
      }
    }
  }

  // Yeni cihaz mı? (kayıtlı device_ids'te yoksa anomali)
  if (
    input.device_id &&
    req.authUser?.device_ids &&
    req.authUser.device_ids.length > 0 &&
    !req.authUser.device_ids.includes(input.device_id)
  ) {
    reviewReasons.push('unknown_device');
  }

  // WiFi BSSID whitelist'te mi? (web'de çoğu zaman gelmez, sadece flag)
  if (
    input.wifi_bssid &&
    location.wifi_bssids.length > 0 &&
    !location.wifi_bssids.includes(input.wifi_bssid)
  ) {
    reviewReasons.push('wrong_wifi');
  }

  // Eğer anomali var ve kullanıcı henüz selfie yüklemediyse → selfie iste
  // (input.selfie_url frontend'in selfie upload'tan sonra gönderdiği URL)
  const selfieUrl: string | null = (input as { selfie_url?: string }).selfie_url ?? null;

  // Org "her damgada otomatik selfie iste" diyorsa → anomali olmasa bile selfie iste,
  // ama sadece KANIT amaçlı (event approved kalır, pending_review olmaz).
  // Bu mod KVKK uyumlu: kullanıcı modal'da fotoğraf çekildiğinin BİLGİSİNE sahip.
  const autoSelfieRequired = autoSelfieEveryStamp && !usingNfc && !selfieUrl;
  if (autoSelfieRequired) {
    res.status(200).json({
      needs_selfie: true,
      auto: true, // frontend autoCapture mode'da modal açar
      reasons: ['org_required_selfie'],
      reason_messages: ['Şirket politikası: her damgada otomatik selfie alınır'],
      message:
        'Şirket politikası gereği her damgada bir selfie kaydedilir. Birkaç saniye sürer.',
    });
    return;
  }

  if (reviewReasons.length > 0 && !selfieUrl) {
    res.status(200).json({
      needs_selfie: true,
      auto: false, // anomali var, kullanıcı manuel çekecek
      reasons: reviewReasons,
      reason_messages: reviewReasons.map((r) => REVIEW_REASON_MESSAGES[r] ?? r),
      message:
        'Lokasyon/cihaz doğrulaması yetersiz. Yönetici onayı için selfie çekip yüklemen gerekir.',
      distance_m:
        input.latitude != null && input.longitude != null
          ? Math.round(
              haversineMeters(
                input.latitude,
                input.longitude,
                location.latitude,
                location.longitude,
              ),
            )
          : null,
      geofence_radius_m: location.geofence_radius_m,
    });
    return;
  }

  // Trust score
  const trust = computeTrustScore({
    nfc_raw: input.nfc_tag_id,
    qr_raw: input.qr_code_payload,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    gps_accuracy_m: input.gps_accuracy_m ?? null,
    wifi_bssid: input.wifi_bssid ?? null,
    device_id: input.device_id ?? null,
    client_time: new Date(input.client_time),
    location: {
      latitude: location.latitude,
      longitude: location.longitude,
      geofence_radius_m: location.geofence_radius_m,
      wifi_bssids: location.wifi_bssids,
      nfc_tag_ids: location.nfc_tag_ids,
    },
    knownDeviceIds: req.authUser?.device_ids ?? [],
    serverTime: new Date(),
    signingSecret: env.NFC_SIGNING_SECRET,
  });

  // Trust score düşük → eğer selfie yoksa selfie iste, varsa pending_review
  if (trust.decision === 'reject' && !selfieUrl) {
    res.status(200).json({
      needs_selfie: true,
      reasons: trust.flags.length > 0 ? trust.flags : ['low_trust'],
      reason_messages: (trust.flags.length > 0 ? trust.flags : ['low_trust']).map(
        (r) => REVIEW_REASON_MESSAGES[r] ?? r,
      ),
      message:
        'Doğrulama yetersiz. Yönetici onayı için selfie çekip yüklemen gerekir.',
      trust_score: trust.score,
    });
    return;
  }
  if (trust.decision === 'reject' && selfieUrl) {
    // Selfie var → pending_review olarak akış devam ediyor (aşağıdaki insert)
    if (!reviewReasons.includes('low_trust')) reviewReasons.push('low_trust');
  }

  // Bu blok artık asla çalışmıyor (yukarıda return ediliyor); ama TS happiness için tutuyoruz
  if (false as boolean) {
    throw new HttpError(
      400,
      'Doğrulama yetersiz, check-in reddedildi',
      'TRUST_REJECTED',
      { trust },
    );
  }

  // Evidence hash
  const evidenceHash = computeEvidenceHash({
    user_id: req.authUserId,
    type,
    client_time: input.client_time,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    nfc_tag_id: input.nfc_tag_id ?? null,
    qr_code_payload: input.qr_code_payload ?? null,
    wifi_bssid: input.wifi_bssid ?? null,
    device_id: input.device_id ?? null,
  });

  // IP maskele
  const rawIp = req.ip ?? '0.0.0.0';
  const maskedIp = rawIp.replace(/\.\d+$/, '.0').replace(/(\d+\.\d+)\.\d+\.\d+/, '$1.0.0');

  const now = new Date();
  // Insert (hash chain trigger this_event_hash + previous_event_hash'i otomatik hesaplar)
  // NOT: Trigger evidence_hash + this_event_hash gerektirir, biz boş bir placeholder ile insert ederiz
  const [event] = await db
    .insert(attendanceEvents)
    .values({
      org_id: req.authOrgId,
      user_id: req.authUserId,
      type,
      client_time: new Date(input.client_time),
      server_time: now,
      effective_time: now,
      timezone_at_time: 'Europe/Istanbul',
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      gps_accuracy_m: input.gps_accuracy_m ?? null,
      location_id: location.id,
      distance_from_office_m: trust.distance_from_office_m ?? null,
      nfc_tag_id: input.nfc_tag_id ?? null,
      nfc_signature: null, // raw NFC içeriğindeki imzayı tag_id'den ayrı saklamıyoruz
      qr_code_payload: input.qr_code_payload ?? null,
      wifi_bssid: input.wifi_bssid ?? null,
      device_id: input.device_id ?? null,
      ip_address: maskedIp,
      user_agent: req.headers['user-agent']?.slice(0, 200),
      verification_methods: trust.verification_methods,
      verification_score: trust.score,
      evidence_hash: evidenceHash,
      this_event_hash: 'PENDING', // trigger hesaplayacak
      app_version: input.app_version,
      device_info: input.device_info as never,
      flags: trust.flags,
      // Anomali tespit edildiyse → pending_review + selfie + sebepler
      review_status: reviewReasons.length > 0 ? 'pending_review' : 'approved',
      selfie_url: selfieUrl,
      review_reasons: reviewReasons,
    })
    .returning();

  if (!event) {
    throw new HttpError(500, 'Event kaydedilemedi');
  }

  // Yeni cihazsa kullanıcının device_ids'ine ekle
  if (input.device_id && !req.authUser?.device_ids.includes(input.device_id)) {
    await db
      .update(users)
      .set({
        device_ids: [...(req.authUser?.device_ids ?? []), input.device_id].slice(-5),
      })
      .where(eq(users.id, req.authUserId));
  }

  // === XP audit log + Streak ===
  // Pending review olmayan damgalarda XP kazanılır (admin onaylamadan kazanım yok).
  if (event.review_status === 'approved') {
    // 0) Streak hesaplama (sadece check_in için — günlük 1 kez tetiklenir)
    if (type === 'check_in') {
      const today = new Date(event.server_time);
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Bugün önceden başka check_in var mı? (varsa streak değişmez)
      const [todayPriorCheckIn] = await db
        .select({ id: attendanceEvents.id })
        .from(attendanceEvents)
        .where(
          and(
            eq(attendanceEvents.user_id, req.authUserId),
            eq(attendanceEvents.type, 'check_in'),
            gte(attendanceEvents.server_time, today),
            sql`${attendanceEvents.id} <> ${event.id}`,
          ),
        )
        .limit(1);

      if (!todayPriorCheckIn) {
        // Dün check_in var mı?
        const [yesterdayCheckIn] = await db
          .select({ id: attendanceEvents.id })
          .from(attendanceEvents)
          .where(
            and(
              eq(attendanceEvents.user_id, req.authUserId),
              eq(attendanceEvents.type, 'check_in'),
              gte(attendanceEvents.server_time, yesterday),
              sql`${attendanceEvents.server_time} < ${today}`,
            ),
          )
          .limit(1);

        const oldStreak = req.authUser?.current_streak ?? 0;
        const newStreak = yesterdayCheckIn ? oldStreak + 1 : 1;
        const newLongest = Math.max(req.authUser?.longest_streak ?? 0, newStreak);

        await db
          .update(users)
          .set({ current_streak: newStreak, longest_streak: newLongest })
          .where(eq(users.id, req.authUserId));

        // Milestone bonusları
        const milestones: Array<{ value: number; bonus: number; source: string; label: string }> = [
          { value: 7, bonus: 50, source: 'streak_7', label: '7 günlük seri' },
          { value: 30, bonus: 200, source: 'streak_30', label: '30 günlük seri' },
          { value: 100, bonus: 1000, source: 'streak_100', label: '100 günlük seri' },
        ];
        for (const m of milestones) {
          if (newStreak === m.value) {
            await awardXp({
              orgId: req.authOrgId,
              userId: req.authUserId,
              source: m.source,
              amount: m.bonus,
              description: `🔥 ${m.label} bonusu`,
              refId: event.id,
              refType: 'attendance_event',
            });
            break;
          }
        }
      }
    }

    // 1) Temel damga XP'si
    await awardXp({
      orgId: req.authOrgId,
      userId: req.authUserId,
      source: type === 'check_in' ? 'check_in' : 'check_out',
      amount: 10,
      description: type === 'check_in' ? 'Giriş damgası' : 'Çıkış damgası',
      refId: event.id,
      refType: 'attendance_event',
    });

    // 2) Çalışma saatlerine uygunluk bonusu
    const onTime = computeOnTimeBonus({
      type,
      serverTime: event.server_time,
      workStart: location.work_hours_start || '09:00',
      workEnd: location.work_hours_end || '18:00',
    });
    if (onTime.bonus > 0) {
      await awardXp({
        orgId: req.authOrgId,
        userId: req.authUserId,
        source: onTime.reason,
        amount: onTime.bonus,
        description:
          onTime.reason === 'on_time_check_in'
            ? 'Zamanında giriş bonusu'
            : onTime.reason === 'full_day_check_out'
              ? 'Tam gün çıkışı bonusu'
              : 'Çalışma saati bonusu',
        refId: event.id,
        refType: 'attendance_event',
      });
    }

    // 3) Tam doğrulama bonusu (trust 100)
    if (trust.score >= 100) {
      await awardXp({
        orgId: req.authOrgId,
        userId: req.authUserId,
        source: 'check_in_full_trust',
        amount: 5,
        description: 'Tam doğrulama bonusu (trust 100)',
        refId: event.id,
        refType: 'attendance_event',
      });
    }
  }

  logger.info(
    {
      userId: req.authUserId,
      type,
      score: trust.score,
      decision: trust.decision,
      flags: trust.flags,
    },
    `✓ ${type}`,
  );

  // Webhook tetikle (fire-and-forget)
  void dispatchWebhook({
    orgId: req.authOrgId,
    eventType: type === 'check_in' ? 'check_in.created' : 'check_out.created',
    payload: {
      event_id: event.id,
      user_id: req.authUserId,
      type,
      server_time: event.server_time.toISOString(),
      verification_score: trust.score,
      flags: trust.flags,
      location_id: location.id,
    },
  });

  res.status(201).json({
    event_id: event.id,
    server_time: event.server_time.toISOString(),
    verification_score: trust.score,
    decision: trust.decision,
    flags: trust.flags,
    verification_methods: trust.verification_methods,
    distance_from_office_m: trust.distance_from_office_m,
    breakdown: trust.breakdown,
    this_event_hash: event.this_event_hash,
    xp_gained: 10, // basit MVP — gamification daha sonra detaylandırılır
    new_streak: req.authUser?.current_streak ?? 0,
    review_status: event.review_status,
    review_reasons: event.review_reasons,
    selfie_url: event.selfie_url,
  });
}

checkInRouter.post('/check-in', requireAuth, requireScope('events:write'), checkInLimiter, async (req, res, next) => {
  try {
    await performAttendance('check_in', req, res);
  } catch (err) {
    next(err);
  }
});

checkInRouter.post('/check-out', requireAuth, requireScope('events:write'), checkInLimiter, async (req, res, next) => {
  try {
    await performAttendance('check_out', req, res);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/stamp — OTOMATIK damga (giriş/çıkış kullanıcı seçmez)
 *
 * Backend kullanıcının BUGÜNKÜ son event'ine bakar:
 *   - Hiç event yok → check_in
 *   - Son event check_in → check_out
 *   - Son event check_out → check_in (yeni vardiya başlangıcı)
 *
 * Bu sayede çalışan unutamaz, yanlış seçemez.
 */
checkInRouter.post(
  '/stamp',
  requireAuth,
  requireScope('events:write'),
  checkInLimiter,
  async (req, res, next) => {
    try {
      if (!req.authUserId) throw new HttpError(401, 'Yetki yok');

      // Bugünün başlangıcı (UTC)
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const [last] = await getDb()
        .select({ type: attendanceEvents.type })
        .from(attendanceEvents)
        .where(
          and(
            eq(attendanceEvents.user_id, req.authUserId),
            gte(attendanceEvents.server_time, today),
          ),
        )
        .orderBy(desc(attendanceEvents.server_time))
        .limit(1);

      const nextType: 'check_in' | 'check_out' =
        !last || last.type === 'check_out' ? 'check_in' : 'check_out';

      await performAttendance(nextType, req, res);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/stamp/selfie-upload — selfie yükle, public URL döner.
 *
 * Body: JSON { contentType, base64 } — image/jpeg|png|webp + base64 encoded.
 * (Multipart yerine basit JSON; mobil/web kolayca FileReader.readAsDataURL kullanır.)
 *
 * Response: { url, path }
 */
const selfieUploadSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  base64: z.string().min(100).max(8_000_000), // ~6MB base64 → ~4.5MB binary
});

checkInRouter.post('/stamp/selfie-upload', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUserId || !req.authOrgId) throw new HttpError(401, 'Yetki yok');
    const input = selfieUploadSchema.parse(req.body);
    const buffer = Buffer.from(input.base64, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      throw new HttpError(400, 'Selfie 5MB üstü kabul edilmiyor', 'TOO_LARGE');
    }
    const result = await uploadSelfie({
      orgId: req.authOrgId,
      userId: req.authUserId,
      buffer,
      contentType: input.contentType,
    });
    res.json({ url: result.url, path: result.path });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/admin/pending-reviews — onay bekleyen damgaları listele
 * Sadece manager / admin / owner görebilir.
 */
checkInRouter.get(
  '/admin/pending-reviews',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const rows = await getDb()
        .select({
          event: attendanceEvents,
          user_name: users.full_name,
          user_email: users.email,
          user_phone: users.phone,
          user_department: users.department,
          location_name: locations.name,
        })
        .from(attendanceEvents)
        .leftJoin(users, eq(users.id, attendanceEvents.user_id))
        .leftJoin(locations, eq(locations.id, attendanceEvents.location_id))
        .where(
          and(
            eq(attendanceEvents.org_id, req.authOrgId),
            eq(attendanceEvents.review_status, 'pending_review'),
          ),
        )
        .orderBy(desc(attendanceEvents.server_time))
        .limit(100);

      const items = rows.map((r) => ({
        id: r.event.id,
        type: r.event.type,
        server_time: r.event.server_time,
        client_time: r.event.client_time,
        user_name: r.user_name,
        user_email: r.user_email,
        user_phone: r.user_phone,
        user_department: r.user_department,
        location_name: r.location_name,
        latitude: r.event.latitude,
        longitude: r.event.longitude,
        gps_accuracy_m: r.event.gps_accuracy_m,
        distance_from_office_m: r.event.distance_from_office_m,
        verification_score: r.event.verification_score,
        verification_methods: r.event.verification_methods,
        review_reasons: r.event.review_reasons,
        selfie_url: r.event.selfie_url,
        flags: r.event.flags,
      }));
      res.json({ items });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/admin/events/:id/review — yöneticinin onay/red kararı
 * Body: { decision: 'approve' | 'reject', notes?: string }
 */
const reviewDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().max(500).optional(),
});

checkInRouter.post(
  '/admin/events/:id/review',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const body = reviewDecisionSchema.parse(req.body);

      const [event] = await getDb()
        .select()
        .from(attendanceEvents)
        .where(
          and(
            eq(attendanceEvents.id, id),
            eq(attendanceEvents.org_id, req.authOrgId),
          ),
        );
      if (!event) throw new HttpError(404, 'Damga bulunamadı');
      if (event.review_status !== 'pending_review') {
        throw new HttpError(400, `Bu damga zaten ${event.review_status} durumunda`, 'ALREADY_REVIEWED');
      }

      const newStatus = body.decision === 'approve' ? 'approved' : 'rejected';
      await getDb()
        .update(attendanceEvents)
        .set({
          review_status: newStatus,
          reviewed_by_user_id: req.authUserId,
          reviewed_at: new Date(),
          review_notes: body.notes ?? null,
        })
        .where(eq(attendanceEvents.id, id));

      logger.info(
        { eventId: id, by: req.authUserId, decision: body.decision },
        'Pending damga incelendi',
      );

      res.json({ ok: true, review_status: newStatus });
    } catch (err) {
      next(err);
    }
  },
);

/** unused-import suppressors */
const _suppress = { sql, inArray };
void _suppress;
