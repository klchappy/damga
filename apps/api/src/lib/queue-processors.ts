/**
 * BullMQ job processor map — her job tipinin handler'ı.
 *
 * Mevcut in-process cron'ların logic'i AYNI fonksiyonlardan çağrılır.
 * Sadece tetikleme mekanizması (setInterval → BullMQ) değişti.
 *
 * Bu sayede:
 *   - Geriye uyumluluk %100 (logic değişmedi)
 *   - Multi-instance API'da duplicate çalışmaz (BullMQ tek worker'a verir)
 *   - Restart sonrası kaçırılan job'lar otomatik retry (BullMQ persistence)
 */
import type { Processor } from 'bullmq';

/**
 * Job processor map. queue.ts'in startWorker()'ı bunu kullanır.
 *
 * NOT: Job handler'ları dinamik import ediyoruz — eski cron lib'leri'nin
 * top-level setInterval'ı yan etkiyle başlatmasın diye.
 */
export const processors: Record<string, Processor> = {
  'weekly-leaderboard-finalize': async () => {
    const { runWeeklyLeaderboardFinalize } = await import('./scheduler-jobs');
    await runWeeklyLeaderboardFinalize();
  },
  'monthly-leaderboard-finalize': async () => {
    const { runMonthlyLeaderboardFinalize } = await import('./scheduler-jobs');
    await runMonthlyLeaderboardFinalize();
  },
  'annual-leave-reset': async () => {
    const { runAnnualLeaveReset } = await import('./scheduler-jobs');
    await runAnnualLeaveReset();
  },
  'daily-credit-expire': async () => {
    const { runDailyCreditExpire } = await import('./scheduler-jobs');
    await runDailyCreditExpire();
  },
  'health-monitor-ping': async () => {
    const { runHealthPings } = await import('./scheduler-jobs');
    await runHealthPings();
  },
  'account-cleanup': async () => {
    const { runAccountCleanup } = await import('./scheduler-jobs');
    await runAccountCleanup();
  },
  'monitor-pings-retention': async () => {
    const { runMonitorPingsRetention } = await import('./scheduler-jobs');
    await runMonitorPingsRetention();
  },
  'weekly-hetzner-snapshot': async () => {
    const { runWeeklyHetznerSnapshot } = await import('./scheduler-jobs');
    await runWeeklyHetznerSnapshot();
  },
};
