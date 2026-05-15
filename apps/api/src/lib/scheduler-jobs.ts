/**
 * Cron job business logic — tek noktadan tetiklenir.
 *
 * Hem BullMQ worker (production scale) hem in-process cron (Redis yoksa fallback)
 * bu fonksiyonları çağırır. Logic değişmedi — sadece "kim tetikler" değişti.
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@damga/db';
import { logger } from '../config/logger';
import { runWeekly, runMonthly, runAnnualLeaveReset as _annualReset, expireOldCredits } from './scheduler';
import { runPings } from './health-monitor';
import { anonymizeReadyUsers, hardDeleteOldUsers } from './account-cleanup';
import { runWeeklySnapshot } from './hetzner-snapshot';

export async function runWeeklyLeaderboardFinalize(): Promise<void> {
  await runWeekly();
}

export async function runMonthlyLeaderboardFinalize(): Promise<void> {
  await runMonthly();
}

export async function runAnnualLeaveReset(): Promise<void> {
  await _annualReset();
}

export async function runDailyCreditExpire(): Promise<void> {
  await expireOldCredits();
}

export async function runHealthPings(): Promise<void> {
  await runPings();
}

export async function runMonitorPingsRetention(): Promise<void> {
  try {
    const r = await getDb().execute(
      sql`DELETE FROM public.monitor_pings WHERE checked_at < now() - interval '90 days'`,
    );
    const count = (r as { rowCount?: number }).rowCount ?? 0;
    if (count > 0) {
      logger.info({ deleted: count }, '🗑️ monitor_pings retention');
    }
  } catch (err) {
    logger.error({ err }, 'monitor retention failed');
    throw err;
  }
}

export async function runAccountCleanup(): Promise<void> {
  const anon = await anonymizeReadyUsers();
  const hard = await hardDeleteOldUsers();
  logger.info({ anonymized: anon.count, hardDeleted: hard.count }, '✓ account-cleanup tamam');
}

export async function runWeeklyHetznerSnapshot(): Promise<void> {
  const result = await runWeeklySnapshot();
  if (result.skipped) {
    logger.info({ reason: result.skipped }, 'Hetzner snapshot skipped (env eksik)');
    return;
  }
  if (result.errors.length > 0) {
    logger.warn({ errors: result.errors }, 'Hetzner snapshot kısmi hata');
  }
}
