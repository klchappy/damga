/**
 * performAttendance içinden çıkarılan yardımcı fonksiyonlar.
 *
 * Amaç: Ana fonksiyonu okunabilirlik için kısaltmak. Hiçbir davranış değişmiyor —
 * sadece kod organizasyonu. performAttendance bu helper'ları sıralı çağırır.
 *
 * Test coverage: tests/attendance-helpers.test.ts (Batch 21'de eklenecek).
 */
import { and, desc, eq, gte } from 'drizzle-orm';
import { getDb, attendanceEvents } from '@damga/db';
import { HttpError } from '../middleware/error';
import { logger } from '../config/logger';
import { notifyOrgManagers } from './notifications';
import { VELOCITY_WINDOW_MS } from '../config/constants';

/**
 * Velocity check — aynı kullanıcı 30 saniyede ikinci damga atamaz.
 *
 * Throws: HttpError 429 VELOCITY_BLOCKED — son damgadan henüz 30sn geçmediyse.
 *
 * Bu kontrol replay attack + accidental double-tap'ı engeller.
 * Frontend zaten button disable yapıyor ama defense-in-depth.
 */
export async function enforceVelocityLimit(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - VELOCITY_WINDOW_MS);
  const [recent] = await getDb()
    .select({ id: attendanceEvents.id })
    .from(attendanceEvents)
    .where(and(eq(attendanceEvents.user_id, userId), gte(attendanceEvents.server_time, cutoff)))
    .orderBy(desc(attendanceEvents.server_time))
    .limit(1);
  if (recent) {
    throw new HttpError(
      429,
      'Çok hızlı tekrar denedin — son damgadan en az 30 saniye sonra tekrar dene.',
      'VELOCITY_BLOCKED',
    );
  }
}

/**
 * Damga sonrası yöneticilere real-time bildirim gönder.
 * (fire-and-forget — failure ana akışı bozmaz)
 */
export function notifyAdminsOfStamp(args: {
  orgId: string;
  userId: string;
  type: 'check_in' | 'check_out';
  stamperName: string;
  stamperEmail: string;
  locationName: string;
  locationId: string;
  trustScore: number;
  trustDecision: string;
  flags: string[];
  verificationMethods: string[];
  eventId: string;
  serverTime: Date;
}): void {
  const actionEmoji = args.type === 'check_in' ? '🟢' : '🔴';
  const actionLabel = args.type === 'check_in' ? 'giriş yaptı' : 'çıkış yaptı';
  const trustEmoji = args.trustScore >= 100 ? '✓' : args.trustScore >= 80 ? '⚠️' : '🚨';

  void notifyOrgManagers({
    orgId: args.orgId,
    type: args.type === 'check_in' ? 'stamp_check_in' : 'stamp_check_out',
    title: `${actionEmoji} ${args.stamperName} ${actionLabel}`,
    body:
      `📍 ${args.locationName}` +
      ` · ${trustEmoji} Güven: ${args.trustScore}/100` +
      (args.flags.length > 0 ? ` · ⚠️ ${args.flags.slice(0, 2).join(', ')}` : ''),
    url: '/admin/live-feed',
    excludeUserId: args.userId,
    metadata: {
      event_id: args.eventId,
      stamper_user_id: args.userId,
      stamper_name: args.stamperName,
      stamper_email: args.stamperEmail,
      location_id: args.locationId,
      location_name: args.locationName,
      trust_score: args.trustScore,
      trust_decision: args.trustDecision,
      flags: args.flags,
      verification_methods: args.verificationMethods,
      server_time: args.serverTime.toISOString(),
    },
  }).catch((err) =>
    logger.warn({ err, eventId: args.eventId }, 'notifyAdminsOfStamp failed'),
  );
}
