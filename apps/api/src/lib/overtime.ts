/**
 * Otomatik fazla mesai tespiti.
 *
 * `check_out` event insert edildiğinde çağrılır:
 *   1) O kullanıcı için bugünkü shift_assignment'ı bul
 *   2) Beklenen çıkış saati (override > template.end_time)
 *   3) Gerçek çıkış − beklenen > overtime_threshold_minutes ise overtime_record oluştur
 *   4) Status = 'pending' (manager onaylar)
 */

import { and, eq, gte, lt, sql } from 'drizzle-orm';
import {
  getDb,
  shiftAssignments,
  shiftTemplates,
  overtimeRecords,
} from '@damga/db';
import { logger } from '../config/logger';

/**
 * 'HH:MM' string'ini bugünün UTC tarihinde Date'e çevirir.
 * Türkiye TZ varsayımı: Europe/Istanbul (UTC+3, DST yok 2016'dan beri).
 * Vardiya şablonu lokal saat olarak girilir, server time UTC.
 */
function localTimeToServerDate(timeStr: string, baseDate: Date): Date {
  const [h, m] = timeStr.split(':').map(Number) as [number, number];
  // Türkiye lokal: 09:00 → UTC 06:00. Date'i lokal day'da kur, sonra TZ offset uygula
  const istanbulOffsetMin = 180; // UTC+3
  const localMin = (h ?? 9) * 60 + (m ?? 0);
  const utcMin = localMin - istanbulOffsetMin;
  const d = new Date(baseDate);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMinutes(utcMin);
  return d;
}

export async function detectOvertime(args: {
  orgId: string;
  userId: string;
  eventId: string;
  serverTime: Date;
}): Promise<{ created: boolean; minutes: number; record_id?: string }> {
  const db = getDb();

  // Bugünkü tarih (Istanbul) — vardiya tarihiyle eşleştirmek için
  const istanbulDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(args.serverTime); // 'YYYY-MM-DD'

  // O günkü vardiya ataması
  const [row] = await db
    .select({
      a: shiftAssignments,
      t: shiftTemplates,
    })
    .from(shiftAssignments)
    .innerJoin(shiftTemplates, eq(shiftTemplates.id, shiftAssignments.shift_template_id))
    .where(
      and(
        eq(shiftAssignments.org_id, args.orgId),
        eq(shiftAssignments.user_id, args.userId),
        eq(shiftAssignments.shift_date, istanbulDay),
        sql`${shiftAssignments.status} <> 'swapped'`,
      ),
    )
    .limit(1);

  if (!row) return { created: false, minutes: 0 };

  // Aynı assignment için zaten kayıt var mı?
  const [exist] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(overtimeRecords)
    .where(
      and(
        eq(overtimeRecords.shift_assignment_id, row.a.id),
        sql`${overtimeRecords.status} <> 'rejected'`,
      ),
    );
  if ((exist?.c ?? 0) > 0) return { created: false, minutes: 0 };

  const expectedEnd = row.a.override_end ?? row.t.end_time; // 'HH:MM'
  const expectedDate = localTimeToServerDate(expectedEnd, args.serverTime);

  // Gece vardiyası: end < start ise expected ertesi güne düşer
  const startStr = row.a.override_start ?? row.t.start_time;
  if (expectedEnd <= startStr) {
    expectedDate.setUTCDate(expectedDate.getUTCDate() + 1);
  }

  const diffMin = Math.round((args.serverTime.getTime() - expectedDate.getTime()) / 60000);
  if (diffMin <= row.t.overtime_threshold_minutes) return { created: false, minutes: 0 };

  const [rec] = await db
    .insert(overtimeRecords)
    .values({
      org_id: args.orgId,
      user_id: args.userId,
      shift_assignment_id: row.a.id,
      event_id: args.eventId,
      overtime_minutes: diffMin,
      expected_end: expectedEnd,
      actual_end: args.serverTime,
      status: 'pending',
    })
    .returning({ id: overtimeRecords.id });

  logger.info(
    { userId: args.userId, minutes: diffMin, expected: expectedEnd },
    '⏰ Fazla mesai algılandı',
  );

  return { created: true, minutes: diffMin, record_id: rec?.id };
}

/** Yardımcı: belirli aralıktaki onaylı/bekleyen overtime toplam (raporlar için) */
export async function sumOvertime(args: {
  orgId: string;
  userId?: string;
  fromDate: Date;
  toDate: Date;
  status?: 'pending' | 'approved' | 'rejected';
}): Promise<{ count: number; total_minutes: number }> {
  const db = getDb();
  const conds = [
    eq(overtimeRecords.org_id, args.orgId),
    gte(overtimeRecords.created_at, args.fromDate),
    lt(overtimeRecords.created_at, args.toDate),
  ];
  if (args.userId) conds.push(eq(overtimeRecords.user_id, args.userId));
  if (args.status) conds.push(eq(overtimeRecords.status, args.status));
  const [r] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${overtimeRecords.overtime_minutes}), 0)::int`,
    })
    .from(overtimeRecords)
    .where(and(...conds));
  return { count: r?.count ?? 0, total_minutes: r?.total ?? 0 };
}
