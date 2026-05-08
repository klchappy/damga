/**
 * Damga arka plan görevleri.
 *
 * Şu an tek görev var:
 *   • Her Pazartesi 09:00 (Europe/Istanbul) → tüm aktif org'lar için
 *     leaderboard "weekly" finalize → top 3'e bonus XP otomatik dağıt.
 *
 * node-cron yerine setInterval + tarih kontrolü kullanıyoruz; ek bağımlılık
 * istemez ve dakikada bir tetiklenir. Her tetikte aynı periyotta zaten ödül
 * verilmiş mi kontrol edilir (xp_transactions.source = 'top3_weekly'),
 * o yüzden tekrar çağrılması zarar vermez.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb, orgs, xpTransactions } from '@damga/db';
import { logger } from '../config/logger';
import { awardXp } from './xp';

let timer: NodeJS.Timeout | null = null;
let lastRunHourMonday: string | null = null; // 'YYYY-MM-DD-HH' — aynı saatte tekrar çalışmasın

/** Pazartesi 00:00 Europe/Istanbul */
function getWeeklyPeriodStart(now: Date): Date {
  const d = new Date(now);
  const dow = (d.getDay() + 6) % 7; // 0=Pazartesi
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Bir org için top3 weekly bonus dağıt — zaten verilmişse no-op */
async function finalizeWeeklyForOrg(orgId: string): Promise<{
  awarded: Array<{ user_id: string; rank: number; bonus: number }>;
  skipped: boolean;
}> {
  const db = getDb();
  const periodStart = getWeeklyPeriodStart(new Date());

  // Bu dönem için zaten ödül verildi mi?
  const [exist] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(xpTransactions)
    .where(
      and(
        eq(xpTransactions.org_id, orgId),
        eq(xpTransactions.source, 'top3_weekly'),
        gte(xpTransactions.created_at, periodStart),
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
      and(eq(xpTransactions.org_id, orgId), gte(xpTransactions.created_at, periodStart)),
    )
    .groupBy(xpTransactions.user_id)
    .orderBy(sql`coalesce(sum(${xpTransactions.amount}), 0) desc`)
    .limit(3);

  if (top3.length === 0) return { awarded: [], skipped: true };

  const bonuses = [500, 300, 100];
  const awarded: Array<{ user_id: string; rank: number; bonus: number }> = [];
  for (let i = 0; i < top3.length && i < 3; i++) {
    const t = top3[i]!;
    const bonus = bonuses[i]!;
    await awardXp({
      orgId,
      userId: t.user_id,
      source: 'top3_weekly',
      amount: bonus,
      description: `Haftalık ilk 3 ödülü (sıra ${i + 1}) — otomatik`,
      metadata: { rank: i + 1, period_xp: t.period_xp, automatic: true },
    });
    awarded.push({ user_id: t.user_id, rank: i + 1, bonus });
  }
  return { awarded, skipped: false };
}

async function runWeeklyFinalize(): Promise<void> {
  try {
    const db = getDb();
    const allOrgs = await db.select({ id: orgs.id, name: orgs.name }).from(orgs);
    let totalAwarded = 0;
    for (const o of allOrgs) {
      try {
        const r = await finalizeWeeklyForOrg(o.id);
        totalAwarded += r.awarded.length;
        if (r.awarded.length > 0) {
          logger.info(
            { orgId: o.id, orgName: o.name, awarded: r.awarded },
            '🏆 Auto-finalize weekly: top3 bonus verildi',
          );
        }
      } catch (e) {
        logger.error({ orgId: o.id, err: e }, 'Auto-finalize weekly: org bazında hata');
      }
    }
    logger.info({ orgs: allOrgs.length, totalAwarded }, '✅ Auto-finalize weekly tamamlandı');
  } catch (e) {
    logger.error({ err: e }, 'Auto-finalize weekly: genel hata');
  }
}

/** Dakikada bir tetiklenir, "Pazartesi 09:xx" şartı sağlandığında bir kere çalışır */
function tick(): void {
  // Europe/Istanbul gerçek saatini çıkartmak için Intl ile
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });
  // 'Mon, 2026-05-11, 09'
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  const weekday = get('weekday'); // 'Mon'
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  if (!weekday || !year || !month || !day || !hour) return;

  if (weekday !== 'Mon') return;
  if (hour !== '09') return;

  const key = `${year}-${month}-${day}-${hour}`;
  if (lastRunHourMonday === key) return; // bu saat zaten çalıştı
  lastRunHourMonday = key;

  logger.info({ key }, '⏰ Pazartesi 09:00 — auto-finalize weekly başlıyor');
  void runWeeklyFinalize();
}

export function startScheduler(): void {
  if (timer) return;
  // Her 60 saniyede bir kontrol — Pazartesi 09:00'da fail-safe trigger
  timer = setInterval(tick, 60_000);
  logger.info('🕐 Scheduler başlatıldı: her Pazartesi 09:00 (Europe/Istanbul) auto-finalize weekly');
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
