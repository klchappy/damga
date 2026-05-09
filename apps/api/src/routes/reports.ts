import { Router } from 'express';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  getDb,
  attendanceEvents,
  users,
  leaves,
  overtimeRecords,
  shiftAssignments,
  shiftTemplates,
} from '@damga/db';
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

/**
 * GET /v1/reports/overtime?month=YYYY-MM&format=csv|json&status=approved
 *
 * Ay içindeki onaylı (default) fazla mesai kayıtları — bordroya direkt yüklenebilir.
 * CSV kolonları: Tarih, Ad Soyad, Departman, Vardiya, Beklenen Çıkış, Gerçek Çıkış,
 *              Fazla Mesai (dk), Fazla Mesai (sa), Onay Durumu, Sebep, Onaylayan, Onay Tarihi
 */
const overtimeReportQuery = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM formatı'),
  format: z.enum(['json', 'csv']).default('json'),
  status: z.enum(['approved', 'pending', 'rejected', 'all']).default('approved'),
});

reportsRouter.get(
  '/reports/overtime',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  requireScope('reports:read'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const q = overtimeReportQuery.parse(req.query);
      const [yyyy, mm] = q.month.split('-').map(Number) as [number, number];
      const start = new Date(Date.UTC(yyyy, mm - 1, 1));
      const end = new Date(Date.UTC(yyyy, mm, 0, 23, 59, 59));

      const conds = [
        eq(overtimeRecords.org_id, req.authOrgId),
        gte(overtimeRecords.created_at, start),
        lte(overtimeRecords.created_at, end),
      ];
      if (q.status !== 'all') conds.push(eq(overtimeRecords.status, q.status));

      // Approver alias için ek users join
      const approver = users;
      const employee = users;

      const rows = await getDb()
        .select({
          o: overtimeRecords,
          full_name: employee.full_name,
          email: employee.email,
          department: employee.department,
          template_name: shiftTemplates.name,
          template_start: shiftTemplates.start_time,
          template_end: shiftTemplates.end_time,
          shift_date: shiftAssignments.shift_date,
        })
        .from(overtimeRecords)
        .innerJoin(employee, eq(employee.id, overtimeRecords.user_id))
        .leftJoin(
          shiftAssignments,
          eq(shiftAssignments.id, overtimeRecords.shift_assignment_id),
        )
        .leftJoin(shiftTemplates, eq(shiftTemplates.id, shiftAssignments.shift_template_id))
        .where(and(...conds))
        .orderBy(asc(overtimeRecords.actual_end));

      // Approver isimlerini ek query ile al
      const approverIds = Array.from(
        new Set(
          rows
            .map((r) => r.o.approved_by)
            .filter((x): x is string => !!x),
        ),
      );
      const approvers = approverIds.length
        ? await getDb()
            .select({ id: approver.id, full_name: approver.full_name })
            .from(approver)
            .where(sql`${approver.id} = ANY(${approverIds})`)
        : [];
      const approverMap = new Map(approvers.map((a) => [a.id, a.full_name]));

      const items = rows.map((r) => ({
        id: r.o.id,
        shift_date: r.shift_date ?? r.o.actual_end.toISOString().slice(0, 10),
        full_name: r.full_name,
        email: r.email,
        department: r.department,
        template_name: r.template_name ?? '—',
        template_hours: r.template_start
          ? `${r.template_start.slice(0, 5)}-${r.template_end?.slice(0, 5) ?? ''}`
          : '—',
        expected_end: r.o.expected_end,
        actual_end: r.o.actual_end.toISOString(),
        overtime_minutes: r.o.overtime_minutes,
        overtime_hours: (r.o.overtime_minutes / 60).toFixed(2),
        status: r.o.status,
        reason: r.o.reason ?? '',
        rejection_reason: r.o.rejection_reason ?? '',
        approved_by_name: r.o.approved_by ? approverMap.get(r.o.approved_by) ?? '' : '',
        approved_at: r.o.approved_at?.toISOString() ?? '',
      }));

      const totalMinutes = items
        .filter((i) => q.status === 'all' || i.status === q.status)
        .reduce((s, i) => s + i.overtime_minutes, 0);

      if (q.format === 'csv') {
        const csvEsc = (v: string | number | null | undefined): string => {
          const s = v == null ? '' : String(v);
          if (s.includes('"') || s.includes(',') || s.includes('\n')) {
            return '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        };
        const lines: string[] = [
          [
            'Tarih',
            'Ad Soyad',
            'E-posta',
            'Departman',
            'Vardiya',
            'Vardiya Saati',
            'Beklenen Çıkış',
            'Gerçek Çıkış',
            'Fazla Mesai (dk)',
            'Fazla Mesai (sa)',
            'Durum',
            'Sebep',
            'Red Sebebi',
            'Onaylayan',
            'Onay Tarihi',
          ]
            .map(csvEsc)
            .join(','),
          ...items.map((i) =>
            [
              i.shift_date,
              i.full_name,
              i.email,
              i.department ?? '',
              i.template_name,
              i.template_hours,
              i.expected_end,
              i.actual_end,
              i.overtime_minutes,
              i.overtime_hours,
              i.status,
              i.reason,
              i.rejection_reason,
              i.approved_by_name,
              i.approved_at,
            ]
              .map(csvEsc)
              .join(','),
          ),
        ];
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="overtime-${q.month}-${q.status}.csv"`,
        );
        res.send('﻿' + lines.join('\n')); // UTF-8 BOM
        return;
      }

      res.json({
        month: q.month,
        status: q.status,
        total_minutes: totalMinutes,
        total_hours: (totalMinutes / 60).toFixed(2),
        count: items.length,
        items,
      });
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
