import { Router } from 'express';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, attendanceEvents, users, locations, overtimeRecords } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';

export const analyticsRouter = Router();

const rangeQuery = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30); // son 30 gün
  return {
    fromISO: from.toISOString(),
    toISO: to.toISOString(),
  };
}

function parseRangeISO(q: { date_from?: string; date_to?: string }) {
  const def = defaultRange();
  return {
    fromISO: q.date_from ? new Date(q.date_from + 'T00:00:00').toISOString() : def.fromISO,
    toISO: q.date_to
      ? new Date(q.date_to + 'T23:59:59').toISOString()
      : def.toISO,
  };
}

/**
 * GET /v1/analytics/heatmap?date_from&date_to
 *
 * Hangi gün hangi saatte kaç check_in oluyor — geç gelme analizi.
 * Sonuç: 7 gün × 24 saat hücreleri (48 küme).
 */
analyticsRouter.get(
  '/analytics/heatmap',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const q = rangeQuery.parse(req.query);
      const { fromISO, toISO } = parseRangeISO(q);

      const rows = await getDb()
        .select({
          // Pazartesi=1, Pazar=7 (ISO)
          dow: sql<number>`extract(isodow from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul')::int`,
          hour: sql<number>`extract(hour from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul')::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(attendanceEvents)
        .where(
          and(
            eq(attendanceEvents.org_id, req.authOrgId),
            eq(attendanceEvents.type, 'check_in'),
            gte(attendanceEvents.server_time, new Date(fromISO)),
            lte(attendanceEvents.server_time, new Date(toISO)),
          ),
        )
        .groupBy(
          sql`extract(isodow from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul')`,
          sql`extract(hour from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul')`,
        );

      // Geç check-in (>= 09:15) ve normal saatleri ayrıca topla
      const lateRows = await getDb()
        .select({
          dow: sql<number>`extract(isodow from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul')::int`,
          hour: sql<number>`extract(hour from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul')::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(attendanceEvents)
        .where(
          and(
            eq(attendanceEvents.org_id, req.authOrgId),
            eq(attendanceEvents.type, 'check_in'),
            gte(attendanceEvents.server_time, new Date(fromISO)),
            lte(attendanceEvents.server_time, new Date(toISO)),
            // 09:15'ten sonra check_in = geç
            sql`(extract(hour from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul') > 9
                 or (extract(hour from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul') = 9
                     and extract(minute from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul') >= 15))`,
          ),
        )
        .groupBy(
          sql`extract(isodow from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul')`,
          sql`extract(hour from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul')`,
        );

      res.json({
        date_from: fromISO,
        date_to: toISO,
        cells: rows.map((r) => ({ dow: r.dow, hour: r.hour, count: r.count })),
        late_cells: lateRows.map((r) => ({ dow: r.dow, hour: r.hour, count: r.count })),
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /v1/analytics/dept-compare?date_from&date_to
 *
 * Departman bazında: toplam check_in, ortalama trust, geç gelme oranı,
 * onaylı fazla mesai dakikası, kullanıcı sayısı.
 */
analyticsRouter.get(
  '/analytics/dept-compare',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const q = rangeQuery.parse(req.query);
      const { fromISO, toISO } = parseRangeISO(q);

      const stats = await getDb()
        .select({
          dept: sql<string | null>`coalesce(${users.department}, 'Diğer')`,
          total_checkins: sql<number>`count(*) filter (where ${attendanceEvents.type} = 'check_in')::int`,
          avg_trust: sql<number>`coalesce(round(avg(${attendanceEvents.verification_score})), 0)::int`,
          late_count: sql<number>`count(*) filter (
            where ${attendanceEvents.type} = 'check_in'
            and (extract(hour from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul') > 9
                 or (extract(hour from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul') = 9
                     and extract(minute from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul') >= 15))
          )::int`,
          unique_users: sql<number>`count(distinct ${attendanceEvents.user_id})::int`,
        })
        .from(attendanceEvents)
        .innerJoin(users, eq(users.id, attendanceEvents.user_id))
        .where(
          and(
            eq(attendanceEvents.org_id, req.authOrgId),
            gte(attendanceEvents.server_time, new Date(fromISO)),
            lte(attendanceEvents.server_time, new Date(toISO)),
          ),
        )
        .groupBy(sql`coalesce(${users.department}, 'Diğer')`);

      // Departman bazında onaylı overtime
      const otByDept = await getDb()
        .select({
          dept: sql<string | null>`coalesce(${users.department}, 'Diğer')`,
          total_minutes: sql<number>`coalesce(sum(${overtimeRecords.overtime_minutes}), 0)::int`,
        })
        .from(overtimeRecords)
        .innerJoin(users, eq(users.id, overtimeRecords.user_id))
        .where(
          and(
            eq(overtimeRecords.org_id, req.authOrgId),
            eq(overtimeRecords.status, 'approved'),
            gte(overtimeRecords.created_at, new Date(fromISO)),
            lte(overtimeRecords.created_at, new Date(toISO)),
          ),
        )
        .groupBy(sql`coalesce(${users.department}, 'Diğer')`);

      const otMap = new Map(otByDept.map((r) => [r.dept ?? 'Diğer', r.total_minutes]));
      const items = stats.map((s) => ({
        department: s.dept ?? 'Diğer',
        total_checkins: s.total_checkins,
        avg_trust: s.avg_trust,
        late_count: s.late_count,
        late_pct:
          s.total_checkins > 0 ? Math.round((s.late_count / s.total_checkins) * 100) : 0,
        unique_users: s.unique_users,
        approved_overtime_minutes: otMap.get(s.dept ?? 'Diğer') ?? 0,
      }));
      res.json({ date_from: fromISO, date_to: toISO, items });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /v1/analytics/trend?date_from&date_to
 *
 * Günlük trend: her gün için check_in sayısı + ortalama trust + geç sayısı.
 */
analyticsRouter.get(
  '/analytics/trend',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const q = rangeQuery.parse(req.query);
      const { fromISO, toISO } = parseRangeISO(q);

      const rows = await getDb()
        .select({
          day: sql<string>`to_char(${attendanceEvents.server_time} at time zone 'Europe/Istanbul', 'YYYY-MM-DD')`,
          total: sql<number>`count(*) filter (where ${attendanceEvents.type} = 'check_in')::int`,
          avg_trust: sql<number>`coalesce(round(avg(${attendanceEvents.verification_score}) filter (where ${attendanceEvents.type} = 'check_in')), 0)::int`,
          late: sql<number>`count(*) filter (
            where ${attendanceEvents.type} = 'check_in'
            and (extract(hour from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul') > 9
                 or (extract(hour from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul') = 9
                     and extract(minute from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul') >= 15))
          )::int`,
        })
        .from(attendanceEvents)
        .where(
          and(
            eq(attendanceEvents.org_id, req.authOrgId),
            gte(attendanceEvents.server_time, new Date(fromISO)),
            lte(attendanceEvents.server_time, new Date(toISO)),
          ),
        )
        .groupBy(
          sql`to_char(${attendanceEvents.server_time} at time zone 'Europe/Istanbul', 'YYYY-MM-DD')`,
        )
        .orderBy(
          sql`to_char(${attendanceEvents.server_time} at time zone 'Europe/Istanbul', 'YYYY-MM-DD')`,
        );

      res.json({ date_from: fromISO, date_to: toISO, items: rows });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /v1/analytics/top-late?date_from&date_to&limit=10
 * En çok geç kalan kullanıcılar.
 */
analyticsRouter.get(
  '/analytics/top-late',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const q = z
        .object({
          date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          limit: z.coerce.number().int().min(1).max(50).default(10),
        })
        .parse(req.query);
      const { fromISO, toISO } = parseRangeISO(q);

      const rows = await getDb()
        .select({
          user_id: attendanceEvents.user_id,
          full_name: users.full_name,
          department: users.department,
          avatar_url: users.avatar_url,
          late_count: sql<number>`count(*)::int`,
          avg_min_late: sql<number>`coalesce(round(avg(
            extract(hour from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul') * 60
            + extract(minute from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul')
            - 9 * 60
          )), 0)::int`,
        })
        .from(attendanceEvents)
        .innerJoin(users, eq(users.id, attendanceEvents.user_id))
        .where(
          and(
            eq(attendanceEvents.org_id, req.authOrgId),
            eq(attendanceEvents.type, 'check_in'),
            gte(attendanceEvents.server_time, new Date(fromISO)),
            lte(attendanceEvents.server_time, new Date(toISO)),
            sql`(extract(hour from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul') > 9
                 or (extract(hour from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul') = 9
                     and extract(minute from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul') >= 15))`,
          ),
        )
        .groupBy(
          attendanceEvents.user_id,
          users.full_name,
          users.department,
          users.avatar_url,
        )
        .orderBy(sql`count(*) desc`)
        .limit(q.limit);

      res.json({ date_from: fromISO, date_to: toISO, items: rows });
    } catch (err) {
      next(err);
    }
  },
);

// `locations` import edildi ama bu modülde kullanılmıyor — _unused export
export const _unused = locations;
