/**
 * XP yardımcıları — kazanım/harcama kayıtlarını ve total_xp güncellemesini tek yerde tutar.
 *
 * Her stamp / mood / streak / redeem işleminde awardXp() çağrılır:
 *  1. xp_transactions'a satır eklenir (audit + revertible)
 *  2. users.total_xp += amount (atomik update)
 *  3. users.level yeniden hesaplanır (sqrt formülü)
 */

import { eq, sql } from 'drizzle-orm';
import { getDb, users, xpTransactions } from '@damga/db';
import { xpToLevel } from '@damga/shared';

export interface AwardXpInput {
  orgId: string;
  userId: string;
  source: string;
  amount: number;
  description?: string;
  refId?: string;
  refType?: string;
  metadata?: Record<string, unknown>;
}

export async function awardXp(input: AwardXpInput) {
  const db = getDb();
  const [tx] = await db
    .insert(xpTransactions)
    .values({
      org_id: input.orgId,
      user_id: input.userId,
      source: input.source,
      amount: input.amount,
      description: input.description ?? null,
      ref_id: input.refId ?? null,
      ref_type: input.refType ?? null,
      metadata: input.metadata ?? {},
    })
    .returning({ id: xpTransactions.id });

  // total_xp + level atomik update
  const [updated] = await db
    .update(users)
    .set({
      total_xp: sql`${users.total_xp} + ${input.amount}`,
      updated_at: new Date(),
    })
    .where(eq(users.id, input.userId))
    .returning({ total_xp: users.total_xp });
  if (updated) {
    const newLevel = xpToLevel(updated.total_xp);
    await db.update(users).set({ level: newLevel }).where(eq(users.id, input.userId));
  }

  return { transaction_id: tx?.id ?? null, total_xp: updated?.total_xp ?? null };
}

/**
 * Çalışma saatlerine uygunluk bonusu/cezası — vardiya bazlı.
 *
 * **ÖNEMLİ:** workStart/workEnd kullanıcının O GÜNKÜ atanmış vardiyasının
 * saatleridir (`shift_lookup.ts`'ten gelir). Lokasyon work_hours DEĞİL.
 * Vardiya yoksa (null) → bonus/penalty UYGULANMAZ ({ 0, 'no_shift_assigned' }).
 *
 * check_in:
 *   - <= start             → +5 (on_time)
 *   - start+15 dk içinde   → +2 (slightly_late)
 *   - start+15 ile +30 dk  →  0 (late, ceza yok ama bonus yok)
 *   - start+30 ile +60 dk  → -5 (late_penalty_30)
 *   - start+60 dk üstü     → -10 (late_penalty_60)
 *
 * check_out:
 *   - >= end          → +5 (full_day)
 *   - end-15 ile end  → +2 (almost_full)
 *   - end-15 öncesi   →  0 (early_check_out)
 */
export function computeOnTimeBonus(args: {
  type: 'check_in' | 'check_out';
  serverTime: Date;
  /** Vardiya start_time (HH:MM, Istanbul). null = vardiya atanmamış */
  workStart: string | null;
  /** Vardiya end_time (HH:MM, Istanbul). null = vardiya atanmamış */
  workEnd: string | null;
  timezone?: string; // şimdilik kullanılmıyor (Europe/Istanbul varsayım)
}): { bonus: number; reason: string } {
  // Vardiya atanmamış kullanıcıya geç/erken cezası/bonusu YOK.
  // (Eski bug: lokasyon work_hours kullanılıyordu → vardiyasız da değerlendiriliyordu)
  if (!args.workStart || !args.workEnd) {
    return { bonus: 0, reason: 'no_shift_assigned' };
  }
  const [sH, sM] = args.workStart.split(':').map(Number) as [number, number];
  const [eH, eM] = args.workEnd.split(':').map(Number) as [number, number];
  const now = args.serverTime;
  // Server UTC, lokasyon Türkiye varsayımı: UTC+3
  const istMinutes =
    ((now.getUTCHours() + 3) % 24) * 60 + now.getUTCMinutes();
  const startMin = (sH ?? 9) * 60 + (sM ?? 0);
  const endMin = (eH ?? 18) * 60 + (eM ?? 0);

  if (args.type === 'check_in') {
    if (istMinutes <= startMin) return { bonus: 5, reason: 'on_time_check_in' };
    if (istMinutes <= startMin + 15)
      return { bonus: 2, reason: 'slightly_late_check_in' };
    if (istMinutes <= startMin + 30) return { bonus: 0, reason: 'late_check_in' };
    if (istMinutes <= startMin + 60)
      return { bonus: -5, reason: 'late_penalty_30' };
    return { bonus: -10, reason: 'late_penalty_60' };
  }
  if (istMinutes >= endMin) return { bonus: 5, reason: 'full_day_check_out' };
  if (istMinutes >= endMin - 15)
    return { bonus: 2, reason: 'almost_full_day' };
  return { bonus: 0, reason: 'early_check_out' };
}
