import { Router } from 'express';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, attendanceEvents, users, leaves } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole, requireScope } from '../middleware/auth';

export const reportsRouter = Router();

const monthQuery = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM formatı'),
  format: z.enum(['json', 'csv']).default('json'),
});

/**
 * GET /v1/reports/attendance?month=2026-05&format=csv
 * Aylık devam raporu — kullanıcı başına çalışılan iş günü sayısı,
 * geç kalmalar, fazla mesai (basit MVP).
 */
reportsRouter.get(
  '/reports/attendance',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  requireScope('reports:read'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const q = monthQuery.parse(req.query);
      const [yyyy, mm] = q.month.split('-').map(Number) as [number, number];
      const start = new Date(Date.UTC(yyyy, mm - 1, 1));
      const end = new Date(Date.UTC(yyyy, mm, 0, 23, 59, 59));

      const rows = await getDb()
        .select({
          userId: users.id,
          fullName: users.full_name,
          email: users.email,
          department: users.department,
          checkIns: sql<number>`count(*) filter (where ${attendanceEvents.type} = 'check_in')::int`,
          checkOuts: sql<number>`count(*) filter (where ${attendanceEvents.type} = 'check_out')::int`,
          flaggedCount: sql<number>`count(*) filter (where ${attendanceEvents.verification_score} < 80)::int`,
          avgScore: sql<number>`avg(${attendanceEvents.verification_score})::numeric(10,1)`,
        })
        .from(users)
        .leftJoin(
          attendanceEvents,
          and(
            eq(attendanceEvents.user_id, users.id),
            gte(attendanceEvents.server_time, start),
            lte(attendanceEvents.server_time, end),
          ),
        )
        .where(eq(users.org_id, req.authOrgId))
        .groupBy(users.id, users.full_name, users.email, users.department);

      if (q.format === 'csv') {
        const csv = [
          'Ad Soyad,E-posta,Departman,Giriş,Çıkış,Bayraklı,Ortalama Trust',
          ...rows.map(
            (r) =>
              `"${r.fullName}","${r.email}","${r.department ?? ''}",${r.checkIns},${r.checkOuts},${r.flaggedCount},${r.avgScore ?? '-'}`,
          ),
        ].join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="damga-${q.month}.csv"`);
        res.send('﻿' + csv); // UTF-8 BOM (Excel TR uyumu)
        return;
      }

      res.json({
        month: q.month,
        items: rows,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Bordro export — basit özet: ay içi check-in/out sayısı + ortalama trust + flagged.
 */
reportsRouter.get(
  '/reports/payroll',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  requireScope('reports:read'),
  async (req, res, next) => {
    // Basit MVP: attendance ile aynı ama ek olarak izin günleri toplam
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const q = monthQuery.parse(req.query);
      const [yyyy, mm] = q.month.split('-').map(Number) as [number, number];
      const startStr = `${yyyy}-${String(mm).padStart(2, '0')}-01`;
      const endStr = `${yyyy}-${String(mm).padStart(2, '0')}-31`;

      const rows = await getDb()
        .select({
          userId: users.id,
          fullName: users.full_name,
          email: users.email,
          department: users.department,
          totalLeaveDays: sql<number>`coalesce(sum(case when ${leaves.status} = 'approved' then cast(${leaves.business_days} as int) else 0 end), 0)::int`,
        })
        .from(users)
        .leftJoin(
          leaves,
          and(
            eq(leaves.user_id, users.id),
            gte(leaves.start_date, startStr),
            lte(leaves.end_date, endStr),
          ),
        )
        .where(eq(users.org_id, req.authOrgId))
        .groupBy(users.id, users.full_name, users.email, users.department);

      if (q.format === 'csv') {
        const csv = [
          'Ad Soyad,E-posta,Departman,Onaylı İzin Günü',
          ...rows.map(
            (r) => `"${r.fullName}","${r.email}","${r.department ?? ''}",${r.totalLeaveDays}`,
          ),
        ].join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="payroll-${q.month}.csv"`);
        res.send('﻿' + csv);
        return;
      }
      res.json({ month: q.month, items: rows });
    } catch (err) {
      next(err);
    }
  },
);

/* ============= BULK EXPORT (entegrasyon) ============= */

const exportQuery = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  date_from: z.string().datetime().optional(),
});

reportsRouter.get(
  '/export/events',
  requireAuth,
  requireScope('events:read'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const q = exportQuery.parse(req.query);
      const conditions = [eq(attendanceEvents.org_id, req.authOrgId)];
      if (q.date_from) conditions.push(gte(attendanceEvents.server_time, new Date(q.date_from)));

      const rows = await getDb()
        .select()
        .from(attendanceEvents)
        .where(and(...conditions));
      if (q.format === 'csv') {
        const csv = [
          'id,user_id,type,server_time,verification_score,location_id,latitude,longitude,this_event_hash',
          ...rows.map(
            (r) =>
              `${r.id},${r.user_id},${r.type},${r.server_time.toISOString()},${r.verification_score},${r.location_id ?? ''},${r.latitude ?? ''},${r.longitude ?? ''},${r.this_event_hash}`,
          ),
        ].join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="damga-events.csv"');
        res.send('﻿' + csv);
        return;
      }
      res.json({ items: rows });
    } catch (err) {
      next(err);
    }
  },
);
