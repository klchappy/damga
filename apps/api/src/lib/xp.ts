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

/** Çalışma saatlerine uygunluk bonusu — basit kural seti */
export function computeOnTimeBonus(args: {
  type: 'check_in' | 'check_out';
  serverTime: Date;
  /** Lokasyonun work_hours_start/end (HH:MM) */
  workStart: string;
  workEnd: string;
  timezone?: string; // şimdilik kullanılmıyor (Europe/Istanbul varsayım)
}): { bonus: number; reason: string } {
  const [sH, sM] = args.workStart.split(':').map(Number) as [number, number];
  const [eH, eM] = args.workEnd.split(':').map(Number) as [number, number];
  const now = args.serverTime;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const startMin = (sH ?? 9) * 60 + (sM ?? 0);
  const endMin = (eH ?? 18) * 60 + (eM ?? 0);

  if (args.type === 'check_in') {
    // Erken (start - 30dk ile start arası): tam bonus
    if (minutes <= startMin) return { bonus: 5, reason: 'on_time_check_in' };
    // start sonrası 15dk: hala kabul (geç değil)
    if (minutes <= startMin + 15) return { bonus: 2, reason: 'slightly_late_check_in' };
    return { bonus: 0, reason: 'late_check_in' };
  }
  // check_out
  if (minutes >= endMin) return { bonus: 5, reason: 'full_day_check_out' };
  if (minutes >= endMin - 15) return { bonus: 2, reason: 'almost_full_day' };
  return { bonus: 0, reason: 'early_check_out' };
}
