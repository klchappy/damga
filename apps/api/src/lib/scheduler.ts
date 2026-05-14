/**
 * Damga arka plan görevleri.
 *
 * Aktif görevler:
 *   • Her Pazartesi 09:00 (Europe/Istanbul) → leaderboard "weekly" finalize
 *   • Her ayın 1. günü 09:00 (Europe/Istanbul) → leaderboard "monthly" finalize
 *
 * Strateji: dakikada bir tetik + duplicate-safe (xp_transactions.source ile kontrol).
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import {
  getDb,
  orgs,
  xpTransactions,
  users,
  monthlyMarketCredits,
} from '@damga/db';
import { logger } from '../config/logger';
import { awardXp } from './xp';
import { createNotification } from './notifications';

let timer: NodeJS.Timeout | null = null;
let lastRunWeekly: string | null = null; // 'YYYY-MM-DD-HH' — aynı saatte tekrar çalışmasın
let lastRunMonthly: string | null = null;

/** Pazartesi 00:00 Europe/Istanbul */
function getWeeklyPeriodStart(now: Date): Date {
  const d = new Date(now);
  const dow = (d.getDay() + 6) % 7; // 0=Pazartesi
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Ay başı 00:00 Europe/Istanbul */
function getMonthlyPeriodStart(now: Date): Date {
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface FinalizeResult {
  awarded: Array<{ user_id: string; rank: number; bonus: number }>;
  skipped: boolean;
}

async function finalizeForOrg(args: {
  orgId: string;
  source: 'top3_weekly' | 'top3_monthly';
  periodStart: Date;
  bonuses: number[];
  label: string;
}): Promise<FinalizeResult> {
  const db = getDb();

  // Duplicate kontrol
  const [exist] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(xpTransactions)
    .where(
      and(
        eq(xpTransactions.org_id, args.orgId),
        eq(xpTransactions.source, args.source),
        gte(xpTransactions.created_at, args.periodStart),
      ),
    );
  if ((exist?.count ?? 0) > 0) return { awarded: [], skipped: true };

  // İlk 3'ü bul
  const top3 = await db
    .select({
      user_id: xpTransactions.user_id,
      period_xp: sql<number>`coalesce(sum(${xpTransactions.amount}), 0)::int`,
    })
    .from(xpTransactions)
    .where(
      and(
        eq(xpTransactions.org_id, args.orgId),
        gte(xpTransactions.created_at, args.periodStart),
      ),
    )
    .groupBy(xpTransactions.user_id)
    .orderBy(sql`coalesce(sum(${xpTransactions.amount}), 0) desc`)
    .limit(3);

  if (top3.length === 0) return { awarded: [], skipped: true };

  const awarded: Array<{ user_id: string; rank: number; bonus: number }> = [];
  for (let i = 0; i < top3.length && i < 3; i++) {
    const t = top3[i]!;
    const bonus = args.bonuses[i]!;
    await awardXp({
      orgId: args.orgId,
      userId: t.user_id,
      source: args.source,
      amount: bonus,
      description: `${args.label} ilk 3 ödülü (sıra ${i + 1}) — otomatik`,
      metadata: { rank: i + 1, period_xp: t.period_xp, automatic: true },
    });
    awarded.push({ user_id: t.user_id, rank: i + 1, bonus });

    // Notification at
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    void createNotification({
      orgId: args.orgId,
      userId: t.user_id,
      type: 'top3_winner',
      title: `${medal} ${args.label} ilk 3'tesin!`,
      body: `${i + 1}. sıra · +${bonus} bonus XP hesabına eklendi`,
      url: '/leaderboard',
      metadata: { rank: i + 1, bonus, period: args.source },
    });

    // AYLIK MARKET CREDIT: sadece monthly finalize'da, top3'e period_xp + bonus kadar
    if (args.source === 'top3_monthly') {
      const credit = (t.period_xp ?? 0) + bonus;
      // expires_at = ay başından 7 gün sonra (this period'un başından + 1 ay + 7 gün)
      const now = new Date();
      const expires = new Date(now.getFullYear(), now.getMonth(), 8, 23, 59, 59);
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      try {
        await getDb()
          .insert(monthlyMarketCredits)
          .values({
            org_id: args.orgId,
            user_id: t.user_id,
            period,
            rank: i + 1,
            credit_amount: credit,
            expires_at: expires,
          });
        void createNotification({
          orgId: args.orgId,
          userId: t.user_id,
          type: 'monthly_market_open',
          title: '🛒 Aylık özel market açıldı',
          body: `${credit} kredinle özel ödüller satın alabilirsin (7 gün geçerli)`,
          url: '/me/monthly-market',
          metadata: { rank: i + 1, credit, period, expires: expires.toISOString() },
        });
      } catch (e) {
        logger.error({ err: e, orgId: args.orgId, userId: t.user_id }, 'Market credit insert failed');
      }
    }
  }
  return { awarded, skipped: false };
}

/** Süresi geçmiş aktif credit'leri pasifleştir (ayın 9'unda 00:00 sonrası) */
export async function expireOldCredits(): Promise<void> {
  try {
    await getDb()
      .update(monthlyMarketCredits)
      .set({ is_active: false })
      .where(
        and(
          eq(monthlyMarketCredits.is_active, true),
          sql`${monthlyMarketCredits.expires_at} < now()`,
        ),
      );
  } catch (e) {
    logger.error({ err: e }, 'expireOldCredits failed');
  }
}

export async function runWeekly(): Promise<void> {
  try {
    const db = getDb();
    const allOrgs = await db.select({ id: orgs.id, name: orgs.name }).from(orgs);
    let total = 0;
    for (const o of allOrgs) {
      try {
        const r = await finalizeForOrg({
          orgId: o.id,
          source: 'top3_weekly',
          periodStart: getWeeklyPeriodStart(new Date()),
          bonuses: [500, 300, 100],
          label: 'Haftalık',
        });
        total += r.awarded.length;
        if (r.awarded.length > 0) {
          logger.info({ orgId: o.id, awarded: r.awarded }, '🏆 weekly: top3 bonus');
        }
      } catch (e) {
        logger.error({ orgId: o.id, err: e }, 'weekly finalize: org hata');
      }
    }
    logger.info({ orgs: allOrgs.length, total }, '✅ weekly finalize tamamlandı');
  } catch (e) {
    logger.error({ err: e }, 'weekly finalize: genel hata');
  }
}

export async function runMonthly(): Promise<void> {
  try {
    const db = getDb();
    const allOrgs = await db.select({ id: orgs.id, name: orgs.name }).from(orgs);
    let total = 0;
    for (const o of allOrgs) {
      try {
        const r = await finalizeForOrg({
          orgId: o.id,
          source: 'top3_monthly',
          periodStart: getMonthlyPeriodStart(new Date()),
          bonuses: [2000, 1000, 500],
          label: 'Aylık',
        });
        total += r.awarded.length;
        if (r.awarded.length > 0) {
          logger.info({ orgId: o.id, awarded: r.awarded }, '🏆 monthly: top3 bonus');
        }
      } catch (e) {
        logger.error({ orgId: o.id, err: e }, 'monthly finalize: org hata');
      }
    }
    logger.info({ orgs: allOrgs.length, total }, '✅ monthly finalize tamamlandı');
  } catch (e) {
    logger.error({ err: e }, 'monthly finalize: genel hata');
  }
}

/** Yıllık izin kotası reset — her 1 Ocak 00:00 (Türkiye) */
export async function runAnnualLeaveReset(): Promise<void> {
  try {
    const db = getDb();
    await db.update(users).set({ annual_leave_used_days: 0, updated_at: new Date() });
    logger.info('🗓️  Yıllık izin used=0 sıfırlandı (tüm kullanıcılar)');
  } catch (e) {
    logger.error({ err: e }, 'annual leave reset failed');
  }
}

/** Dakikada bir tetik */
function tick(): void {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  const weekday = get('weekday');
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  if (!weekday || !year || !month || !day || !hour) return;

  // Pazartesi 09:00 → weekly
  if (weekday === 'Mon' && hour === '09') {
    const key = `${year}-${month}-${day}-${hour}`;
    if (lastRunWeekly !== key) {
      lastRunWeekly = key;
      logger.info({ key }, '⏰ Pazartesi 09:00 — weekly finalize tetiklendi');
      void runWeekly();
    }
  }

  // Ayın 1'i 09:00 → monthly
  if (day === '01' && hour === '09') {
    const key = `${year}-${month}-${day}-${hour}`;
    if (lastRunMonthly !== key) {
      lastRunMonthly = key;
      logger.info({ key }, '⏰ Ay başı 09:00 — monthly finalize tetiklendi');
      void runMonthly();
    }
  }

  // 1 Ocak 00:00 → yıllık izin kotası reset
  if (month === '01' && day === '01' && hour === '00') {
    const key = `${year}-leave-reset`;
    if (lastRunMonthly !== key) {
      // (lastRunMonthly key'ini paylaşıyoruz çünkü her yıl sadece 1 kez)
      void runAnnualLeaveReset();
    }
  }

  // Her gün 00:05'te eski credit'leri expire et (gün başında bir kez)
  if (hour === '00') {
    void expireOldCredits();
  }
}

export function startScheduler(): void {
  if (timer) return;
  timer = setInterval(tick, 60_000);
  logger.info(
    '🕐 Scheduler: weekly (Pzt 09:00) + monthly (ayın 1\'i 09:00) + yıllık izin reset (1 Ocak 00:00)',
  );
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
