/**
 * BullMQ queue manager — distributed cron + background jobs.
 *
 * Mevcut setInterval-based cron'lar (scheduler, health-monitor, account-cleanup)
 * multi-instance API deploy'da DUPLICATE çalışırdı. BullMQ ile bunlar
 * "tek instance" işler — birden fazla worker process aynı job'u çekemez.
 *
 * Tasarım:
 *   - REDIS_URL yoksa: queue null, caller in-process fallback kullanır
 *   - REDIS_URL varsa: BullMQ queue + repeating jobs (cron pattern)
 *
 * Job tipleri:
 *   - weekly-leaderboard-finalize   Pazartesi 09:00 TR
 *   - monthly-leaderboard-finalize  Ay başı 09:00 TR
 *   - annual-leave-reset            1 Ocak 00:00 TR
 *   - daily-credit-expire           Her gün 00:05 TR
 *   - health-monitor-ping           5 dakikada bir
 *   - account-cleanup               Her gün 04:00 TR
 *   - monitor-pings-retention       Her gün 03:00 TR
 */
import { Queue, Worker, type JobsOptions, type Processor } from 'bullmq';
import { getRedis, isRedisAvailable } from './redis';
import { logger } from '../config/logger';
import { withSpanAndCapture } from './sentry';

const QUEUE_NAME = 'damga-jobs';
const TIMEZONE = 'Europe/Istanbul';

let _queue: Queue | null = null;
let _worker: Worker | null = null;

export function getQueue(): Queue | null {
  if (_queue) return _queue;
  const redis = getRedis();
  if (!redis) return null;
  _queue = new Queue(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });
  _queue.on('error', (err) => logger.warn({ err: err.message }, 'BullMQ queue error'));
  return _queue;
}

/**
 * Repeating job tanımları — Damga'nın tüm cron'ları.
 *
 * Pattern: standart crontab + timezone.
 */
interface RepeatJobDef {
  name: string;
  pattern: string;
  jobId: string; // unique — duplicate ekleme önlenir
  data?: Record<string, unknown>;
}

const REPEAT_JOBS: RepeatJobDef[] = [
  // Pazartesi 09:00 TR
  { name: 'weekly-leaderboard-finalize', pattern: '0 9 * * 1', jobId: 'weekly-leaderboard' },
  // Ay başı 09:00 TR
  { name: 'monthly-leaderboard-finalize', pattern: '0 9 1 * *', jobId: 'monthly-leaderboard' },
  // 1 Ocak 00:00 TR
  { name: 'annual-leave-reset', pattern: '0 0 1 1 *', jobId: 'annual-leave-reset' },
  // Her gün 00:05 TR
  { name: 'daily-credit-expire', pattern: '5 0 * * *', jobId: 'credit-expire' },
  // Her 5 dakikada bir
  { name: 'health-monitor-ping', pattern: '*/5 * * * *', jobId: 'health-ping' },
  // Her gün 04:00 TR
  { name: 'account-cleanup', pattern: '0 4 * * *', jobId: 'account-cleanup' },
  // Her gün 03:00 TR — monitor_pings 90+ gün retention
  { name: 'monitor-pings-retention', pattern: '0 3 * * *', jobId: 'pings-retention' },
];

/**
 * Tüm repeating job'ları queue'ya ekler (idempotent — duplicate eklenmez).
 */
export async function scheduleRepeatingJobs(): Promise<void> {
  const queue = getQueue();
  if (!queue) return;

  for (const job of REPEAT_JOBS) {
    try {
      await queue.add(
        job.name,
        job.data ?? {},
        {
          jobId: job.jobId, // unique
          repeat: { pattern: job.pattern, tz: TIMEZONE },
        } satisfies JobsOptions,
      );
    } catch (err) {
      logger.warn({ err, jobName: job.name }, 'Repeating job ekleme hatası');
    }
  }
  logger.info({ count: REPEAT_JOBS.length }, '⏰ BullMQ repeating jobs schedule edildi');
}

/**
 * Worker başlat — job'ları işler.
 * Processor map'i caller tarafından sağlanır (lib/scheduler-jobs.ts).
 */
export function startWorker(processors: Record<string, Processor>): Worker | null {
  if (_worker) return _worker;
  const redis = getRedis();
  if (!redis) return null;

  const processor: Processor = async (job) => {
    const handler = processors[job.name];
    if (!handler) {
      logger.warn({ jobName: job.name }, 'Bilinmeyen job tipi');
      return;
    }
    logger.info({ jobName: job.name, jobId: job.id }, '⚙️  Job başladı');
    const start = Date.now();
    // Sentry custom span — BullMQ auto-instrumentation yok
    return withSpanAndCapture(
      `queue.${job.name}`,
      async () => {
        try {
          const result = await handler(job, '');
          logger.info(
            { jobName: job.name, jobId: job.id, duration_ms: Date.now() - start },
            '✓ Job tamamlandı',
          );
          return result;
        } catch (err) {
          logger.error(
            { err, jobName: job.name, jobId: job.id, duration_ms: Date.now() - start },
            '✗ Job hata',
          );
          throw err;
        }
      },
      { job_name: job.name, job_id: String(job.id ?? 'unknown') },
    );
  };

  _worker = new Worker(QUEUE_NAME, processor, {
    connection: redis,
    concurrency: 5,
    lockDuration: 60_000, // 1 dakika job lock (uzun job'lar için)
  });

  _worker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobName: job?.name, jobId: job?.id }, 'Worker job failed');
  });

  logger.info('👷 BullMQ worker başlatıldı');
  return _worker;
}

export async function stopQueue(): Promise<void> {
  if (_worker) {
    await _worker.close().catch(() => {});
    _worker = null;
  }
  if (_queue) {
    await _queue.close().catch(() => {});
    _queue = null;
  }
}

export { isRedisAvailable };
