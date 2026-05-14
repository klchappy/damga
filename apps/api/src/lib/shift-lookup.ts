/**
 * Vardiya assignment lookup yardımcısı.
 *
 * Bir kullanıcının BELİRLİ bir gündeki (server time → Istanbul day)
 * atanmış vardiyasını bulur. Override saatleri varsa onlar, yoksa şablon saatleri.
 *
 * Hem check-in XP penalty hesabı hem overtime tespiti için kullanılır.
 * Vardiya yoksa null döner — geç/erken cezası UYGULANMAMALIDIR.
 */
import { and, eq, sql } from 'drizzle-orm';
import { getDb, shiftAssignments, shiftTemplates } from '@damga/db';

export interface ShiftWindow {
  /** Vardiya başlangıç saati 'HH:MM' (Istanbul lokal) */
  start: string;
  /** Vardiya bitiş saati 'HH:MM' (Istanbul lokal). Gece vardiyası: end < start */
  end: string;
  assignmentId: string;
  templateId: string;
  shiftDate: string; // 'YYYY-MM-DD' (Istanbul)
  isOverride: boolean; // true ise override_start/end kullanılıyor
}

/** Server time'ı Istanbul gününe çevir ('YYYY-MM-DD') */
export function toIstanbulDayString(serverTime: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(serverTime);
}

/**
 * Kullanıcının O GÜNKÜ atanmış vardiyasını bul.
 * status = 'swapped' olanlar atlanır.
 *
 * Dönüş null ise: o gün için kullanıcıya vardiya atanmamıştır.
 * Bu durumda check-in late/early bonus/penalty UYGULANMAMALIDIR.
 */
export async function getUserShiftForDate(args: {
  orgId: string;
  userId: string;
  serverTime: Date;
}): Promise<ShiftWindow | null> {
  const istanbulDay = toIstanbulDayString(args.serverTime);
  const db = getDb();

  const [row] = await db
    .select({ a: shiftAssignments, t: shiftTemplates })
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

  if (!row) return null;

  const isOverride = !!(row.a.override_start || row.a.override_end);
  const start = row.a.override_start ?? row.t.start_time;
  const end = row.a.override_end ?? row.t.end_time;

  return {
    start,
    end,
    assignmentId: row.a.id,
    templateId: row.t.id,
    shiftDate: istanbulDay,
    isOverride,
  };
}
