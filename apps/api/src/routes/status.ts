/**
 * Public status endpoint — auth gerektirmez.
 *
 * GET /v1/status
 *   ?range=24h | 7d | 30d (default: 24h)
 *
 * Response:
 *   {
 *     range: '24h',
 *     generated_at: '2026-05-14T...',
 *     services: [
 *       {
 *         target: 'web' | 'api',
 *         current: 'up' | 'down' | 'unknown',
 *         last_checked_at: '...',
 *         last_status_code: 200,
 *         last_latency_ms: 123,
 *         uptime_pct: 99.87,
 *         total_checks: 288,
 *         up_checks: 287,
 *         avg_latency_ms: 145,
 *         buckets: [{ ts, up, down, avg_latency }] // 24 saatlik → saatlik bucket
 *       }
 *     ]
 *   }
 */
import { Router } from 'express';
import { and, desc, gte, sql } from 'drizzle-orm';
import { getDb, monitorPings } from '@damga/db';

export const statusRouter = Router();

interface RangeConfig {
  ms: number;
  bucketSecs: number;
}

const RANGES: Record<string, RangeConfig> = {
  '24h': { ms: 24 * 60 * 60 * 1000, bucketSecs: 3600 }, // saatlik
  '7d': { ms: 7 * 24 * 60 * 60 * 1000, bucketSecs: 6 * 3600 }, // 6 saatlik
  '30d': { ms: 30 * 24 * 60 * 60 * 1000, bucketSecs: 24 * 3600 }, // günlük
};

interface ServiceStatus {
  target: 'web' | 'api';
  current: 'up' | 'down' | 'unknown';
  last_checked_at: string | null;
  last_status_code: number | null;
  last_latency_ms: number | null;
  uptime_pct: number;
  total_checks: number;
  up_checks: number;
  avg_latency_ms: number;
  buckets: Array<{ ts: string; up: number; down: number; avg_latency_ms: number }>;
}

statusRouter.get('/', async (req, res) => {
  try {
    const rangeKey = (typeof req.query.range === 'string' ? req.query.range : '24h') as keyof typeof RANGES;
    const cfg = RANGES[rangeKey] ?? RANGES['24h']!;
    const since = new Date(Date.now() - cfg.ms);
    const db = getDb();

    const services: ServiceStatus[] = [];
    for (const target of ['web', 'api'] as const) {
      // Aggregate + bucket
      const rows = await db
        .select({
          total: sql<number>`count(*)::int`,
          up: sql<number>`sum(${monitorPings.is_up})::int`,
          avg_lat: sql<number>`coalesce(round(avg(${monitorPings.latency_ms}))::int, 0)`,
        })
        .from(monitorPings)
        .where(and(sql`${monitorPings.target} = ${target}`, gte(monitorPings.checked_at, since)));
      const agg = rows[0];

      // Latest check
      const [last] = await db
        .select({
          checked_at: monitorPings.checked_at,
          status_code: monitorPings.status_code,
          latency_ms: monitorPings.latency_ms,
          is_up: monitorPings.is_up,
        })
        .from(monitorPings)
        .where(sql`${monitorPings.target} = ${target}`)
        .orderBy(desc(monitorPings.checked_at))
        .limit(1);

      // Time buckets via SQL
      const bucketRows = await db.execute<{
        ts: string;
        up: number;
        down: number;
        avg_latency: number;
      }>(sql`
        SELECT
          to_timestamp(floor(extract(epoch from checked_at) / ${cfg.bucketSecs}) * ${cfg.bucketSecs}) AS ts,
          sum(is_up)::int AS up,
          sum(1 - is_up)::int AS down,
          coalesce(round(avg(latency_ms))::int, 0) AS avg_latency
        FROM public.monitor_pings
        WHERE target = ${target} AND checked_at >= ${since.toISOString()}
        GROUP BY ts
        ORDER BY ts ASC
      `);

      const totalChecks = agg?.total ?? 0;
      const upChecks = agg?.up ?? 0;
      const uptime = totalChecks > 0 ? (upChecks / totalChecks) * 100 : 0;
      const current: ServiceStatus['current'] = last ? (last.is_up === 1 ? 'up' : 'down') : 'unknown';

      // Drizzle execute returns rows as RowList — extract array
      const buckets = (bucketRows as unknown as { rows?: Array<Record<string, unknown>> }).rows
        ? (bucketRows as unknown as { rows: Array<{ ts: string | Date; up: number; down: number; avg_latency: number }> }).rows
        : (bucketRows as unknown as Array<{ ts: string | Date; up: number; down: number; avg_latency: number }>);

      services.push({
        target,
        current,
        last_checked_at: last?.checked_at ? new Date(last.checked_at).toISOString() : null,
        last_status_code: last?.status_code ?? null,
        last_latency_ms: last?.latency_ms ?? null,
        uptime_pct: Math.round(uptime * 100) / 100,
        total_checks: totalChecks,
        up_checks: upChecks,
        avg_latency_ms: agg?.avg_lat ?? 0,
        buckets: (buckets ?? []).map((b) => ({
          ts: typeof b.ts === 'string' ? new Date(b.ts).toISOString() : b.ts.toISOString(),
          up: Number(b.up),
          down: Number(b.down),
          avg_latency_ms: Number(b.avg_latency),
        })),
      });
    }

    // Cache 30s — status sayfası canlı görünsün ama DB'ye spam atmasın
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
    res.json({
      range: rangeKey,
      generated_at: new Date().toISOString(),
      services,
    });
  } catch (err) {
    res.status(500).json({ error: 'status_unavailable', message: (err as Error).message });
  }
});
