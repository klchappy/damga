import { Router } from 'express';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { checkInSchema } from '@damga/shared';
import { computeTrustScore, computeEvidenceHash } from '@damga/verification';
import { getDb, attendanceEvents, locations, users, orgs } from '@damga/db';
import { env } from '../config/env';
import { HttpError } from '../middleware/error';
import { requireAuth, requireScope } from '../middleware/auth';
import { checkInLimiter } from '../middleware/rate-limit';
import { logger } from '../config/logger';
import { dispatchWebhook } from '../modules/webhook-delivery';

export const checkInRouter = Router();

/** Aynı kullanıcının çift damga atmasını engelle (proxy/replay attack) */
const VELOCITY_WINDOW_MS = 30 * 1000; // 30 saniye

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
  //  PROXY-ATTACK SAVUNMA KATMANLARI (QR fotoğraflanması saldırısı)
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

  // 2) GPS + Geofence ZORUNLU (org settings izin vermiyorsa)
  // Org settings'te allow_outside_geofence === true ise atlanır (özel durumlar için)
  const [orgRow] = await db
    .select({ settings: orgs.settings })
    .from(orgs)
    .where(eq(orgs.id, req.authOrgId));
  const allowOutside = !!orgRow?.settings?.allow_outside_geofence;

  // QR ile damga vuruyorsa GPS+Geofence zorunlu (proxy attack savunması)
  // NFC ile damgada fiziksel temas zaten sağlanıyor → bu kontrol opsiyonel
  const usingQrOnly = !!input.qr_code_payload && !input.nfc_tag_id;

  if (usingQrOnly && !allowOutside) {
    if (
      input.latitude == null ||
      input.longitude == null ||
      input.gps_accuracy_m == null
    ) {
      throw new HttpError(
        400,
        'QR ile damga vurmak için GPS izni vermelisin (proxy saldırılarını önler).',
        'GPS_REQUIRED',
      );
    }
    // Mesafe hesaplama trust-score içinde de yapılıyor, ama burada hard reject için tekrar kontrol et
    const distM = haversineMeters(
      input.latitude,
      input.longitude,
      location.latitude,
      location.longitude,
    );
    if (distM > location.geofence_radius_m) {
      throw new HttpError(
        400,
        `Lokasyon dışındasın — ${Math.round(distM)}m uzakta (sınır: ${location.geofence_radius_m}m). Ofise gel ve tekrar dene.`,
        'OUT_OF_GEOFENCE',
        { distance_m: Math.round(distM), geofence_radius_m: location.geofence_radius_m },
      );
    }
    // GPS doğruluğu çok düşükse (örn 500m) reject — fake GPS belirtisi olabilir
    if (input.gps_accuracy_m > 200) {
      throw new HttpError(
        400,
        `GPS doğruluğu çok düşük (±${Math.round(input.gps_accuracy_m)}m). Açık alana çıkıp tekrar dene.`,
        'GPS_LOW_ACCURACY',
      );
    }
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

  if (trust.decision === 'reject') {
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
