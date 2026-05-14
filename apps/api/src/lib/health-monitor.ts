/**
 * Self-hosted uptime monitoring.
 *
 * Her 5 dakikada bir damga.deploi.net (web) ve api.damga.deploi.net/v1/health (api)
 * endpoint'lerine HEAD/GET isteği atar, sonucu monitor_pings tablosuna yazar.
 *
 * 90 günden eski kayıtlar her gün 03:00'te temizlenir.
 *
 * NOT: damga-api kendi /v1/health'ini de ping atıyor (kendi sağlığını kendi raporluyor).
 * Process down olursa ping da olmayacağı için PURE internal monitoring DEĞİL —
 * bu yüzden ek olarak external monitoring (UptimeRobot vb.) önerilir.
 * Yine de container yaşıyor + endpoint hatalı dönüyor senaryolarını yakalar.
 */
import { sql } from 'drizzle-orm';
import { getDb, monitorPings } from '@damga/db';
import { logger } from '../config/logger';

interface MonitorTarget {
  target: 'web' | 'api';
  url: string;
}

const TARGETS: MonitorTarget[] = [
  { target: 'web', url: 'https://damga.deploi.net/' },
  { target: 'api', url: 'https://api.damga.deploi.net/v1/health' },
];

let timer: NodeJS.Timeout | null = null;
let lastRetention: string | null = null; // 'YYYY-MM-DD' — günde 1 kez retention

async function pingOne(t: MonitorTarget): Promise<void> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const resp = await fetch(t.url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'damga-monitor/1.0 (+https://damga.deploi.net)' },
    });
    clearTimeout(timeout);
    const latency = Date.now() - start;
    const isUp = resp.status >= 200 && resp.status < 400;
    await getDb()
      .insert(monitorPings)
      .values({
        target: t.target,
        url: t.url,
        status_code: resp.status,
        latency_ms: latency,
        is_up: isUp ? 1 : 0,
        error: null,
      });
  } catch (err) {
    const latency = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await getDb()
        .insert(monitorPings)
        .values({
          target: t.target,
          url: t.url,
          status_code: 0,
          latency_ms: latency,
          is_up: 0,
          error: msg.slice(0, 500),
        });
    } catch (dbErr) {
      logger.error({ err: dbErr, target: t.target }, 'monitor ping insert failed');
    }
  }
}

async function runPings(): Promise<void> {
  await Promise.all(TARGETS.map((t) => pingOne(t)));
}

async function runRetention(): Promise<void> {
  try {
    const r = await getDb().execute(
      sql`DELETE FROM public.monitor_pings WHERE checked_at < now() - interval '90 days'`,
    );
    logger.info({ deleted: (r as { rowCount?: number }).rowCount }, '🗑️ monitor_pings retention temizliği');
  } catch (e) {
    logger.error({ err: e }, 'monitor retention failed');
  }
}

function tick(): void {
  const now = new Date();
  // Her 5 dakikada bir ping (dakika % 5 === 0 olduğunda)
  if (now.getMinutes() % 5 === 0 && now.getSeconds() < 30) {
    void runPings();
  }
  // Günde 1 kez retention (03:00 TR)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hour = parts.find((p) => p.type === 'hour')?.value;
  const ymd = `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}-${parts.find((p) => p.type === 'day')?.value}`;
  if (hour === '03' && lastRetention !== ymd) {
    lastRetention = ymd;
    void runRetention();
  }
}

export function startHealthMonitor(): void {
  if (timer) return;
  // İlk açılışta da 1 ping at (boot sonrası ilk dataset için)
  void runPings();
  timer = setInterval(tick, 30_000); // 30 saniyede bir kontrol et — 5 dakikalık pencereyi atlamasın
  logger.info('🩺 Health monitor başlatıldı (5 dk interval, web + api hedefleri)');
}

export function stopHealthMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
