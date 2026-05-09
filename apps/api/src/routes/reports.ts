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
 * GET /v1/reports/monthly-summary?month=YYYY-MM&format=csv|json
 *
 * BORDRO 3-1: tek dosyada attendance + onaylı izin + onaylı fazla mesai.
 * Her kullanıcı için tek satır.
 *
 * Hesaplama:
 *  - Çalışılan gün = ay içinde en az 1 check_in olan farklı günler
 *  - Geç kalma = check_in saati >= 09:15 olan günler
 *  - İzin günü = onaylı leave business_days toplamı
 *  - Fazla mesai (dk) = onaylı overtime_records.overtime_minutes toplamı
 *  - Tahmini çalışma saati = (çalışılan gün × 9) + (overtime_min / 60) − (mola)
 */
reportsRouter.get(
  '/reports/monthly-summary',
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
      const startStr = `${yyyy}-${String(mm).padStart(2, '0')}-01`;
      const endStr = `${yyyy}-${String(mm).padStart(2, '0')}-${new Date(yyyy, mm, 0).getDate()}`;

      // Per-user attendance metrics (Istanbul TZ ile gün)
      const attRows = await getDb()
        .select({
          userId: users.id,
          fullName: users.full_name,
          email: users.email,
          department: users.department,
          worked_days: sql<number>`count(distinct date(${attendanceEvents.server_time} at time zone 'Europe/Istanbul')) filter (where ${attendanceEvents.type} = 'check_in')::int`,
          check_in_count: sql<number>`count(*) filter (where ${attendanceEvents.type} = 'check_in')::int`,
          check_out_count: sql<number>`count(*) filter (where ${attendanceEvents.type} = 'check_out')::int`,
          late_count: sql<number>`count(*) filter (
            where ${attendanceEvents.type} = 'check_in'
            and (extract(hour from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul') > 9
                 or (extract(hour from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul') = 9
                     and extract(minute from ${attendanceEvents.server_time} at time zone 'Europe/Istanbul') >= 15))
          )::int`,
          flagged_count: sql<number>`count(*) filter (where ${attendanceEvents.verification_score} < 80)::int`,
          avg_trust: sql<number>`coalesce(round(avg(${attendanceEvents.verification_score}) filter (where ${attendanceEvents.type} = 'check_in')), 0)::int`,
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

      // Onaylı izin günleri toplamı
      const leaveRows = await getDb()
        .select({
          userId: leaves.user_id,
          totalDays: sql<number>`coalesce(sum(cast(${leaves.business_days} as int)), 0)::int`,
        })
        .from(leaves)
        .where(
          and(
            eq(leaves.org_id, req.authOrgId),
            eq(leaves.status, 'approved'),
            gte(leaves.start_date, startStr),
            lte(leaves.end_date, endStr),
          ),
        )
        .groupBy(leaves.user_id);
      const leaveMap = new Map(leaveRows.map((r) => [r.userId, r.totalDays]));

      // Onaylı overtime dakikaları
      const otRows = await getDb()
        .select({
          userId: overtimeRecords.user_id,
          totalMinutes: sql<number>`coalesce(sum(${overtimeRecords.overtime_minutes}), 0)::int`,
        })
        .from(overtimeRecords)
        .where(
          and(
            eq(overtimeRecords.org_id, req.authOrgId),
            eq(overtimeRecords.status, 'approved'),
            gte(overtimeRecords.created_at, start),
            lte(overtimeRecords.created_at, end),
          ),
        )
        .groupBy(overtimeRecords.user_id);
      const otMap = new Map(otRows.map((r) => [r.userId, r.totalMinutes]));

      const items = attRows.map((r) => {
        const leaveDays = leaveMap.get(r.userId) ?? 0;
        const otMin = otMap.get(r.userId) ?? 0;
        const baseHours = r.worked_days * 9; // varsayılan tam gün
        const totalHours = (baseHours + otMin / 60).toFixed(1);
        return {
          user_id: r.userId,
          full_name: r.fullName,
          email: r.email,
          department: r.department ?? '',
          worked_days: r.worked_days,
          check_in_count: r.check_in_count,
          check_out_count: r.check_out_count,
          late_count: r.late_count,
          flagged_count: r.flagged_count,
          avg_trust: r.avg_trust,
          leave_days: leaveDays,
          overtime_minutes: otMin,
          overtime_hours: (otMin / 60).toFixed(2),
          base_hours: baseHours,
          total_hours: totalHours,
        };
      });

      if (q.format === 'csv') {
        const csvEsc = (v: string | number | null | undefined): string => {
          const s = v == null ? '' : String(v);
          if (s.includes('"') || s.includes(',') || s.includes('\n')) {
            return '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        };
        const headers = [
          'Ad Soyad',
          'E-posta',
          'Departman',
          'Çalışılan Gün',
          'Toplam Giriş',
          'Toplam Çıkış',
          'Geç Kalma',
          'Bayraklı',
          'Ortalama Trust',
          'Onaylı İzin (gün)',
          'Fazla Mesai (dk)',
          'Fazla Mesai (sa)',
          'Baz Çalışma (sa)',
          'Toplam Çalışma (sa)',
        ];
        const lines = [
          headers.map(csvEsc).join(','),
          ...items.map((i) =>
            [
              i.full_name,
              i.email,
              i.department,
              i.worked_days,
              i.check_in_count,
              i.check_out_count,
              i.late_count,
              i.flagged_count,
              i.avg_trust,
              i.leave_days,
              i.overtime_minutes,
              i.overtime_hours,
              i.base_hours,
              i.total_hours,
            ]
              .map(csvEsc)
              .join(','),
          ),
        ];
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="bordro-${q.month}.csv"`,
        );
        res.send('﻿' + lines.join('\n'));
        return;
      }

      res.json({
        month: q.month,
        total_users: items.length,
        total_worked_days: items.reduce((s, i) => s + i.worked_days, 0),
        total_overtime_minutes: items.reduce((s, i) => s + i.overtime_minutes, 0),
        items,
      });
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

/**
 * GET /v1/reports/audit-export?month=YYYY-MM&format=csv|json
 *
 * KVKK uyumlu audit raporu — tüm attendance_events kayıtlarının hash chain
 * doğrulaması ile beraber. Her satır:
 *   - id, type, server_time, user, location
 *   - verification_score, verification_methods, flags
 *   - hash, prev_hash, is_valid (chain doğrulama sonucu)
 *
 * Bir denetçiye verilebilir; hash chain'in bütünlüğü ile kayıtların
 * sonradan değiştirilmediği kanıtlanır.
 */
reportsRouter.get(
  '/reports/audit-export',
  requireAuth,
  requireRole('admin', 'owner'),
  requireScope('reports:read'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const q = monthQuery.parse(req.query);
      const [yyyy, mm] = q.month.split('-').map(Number) as [number, number];
      const start = new Date(Date.UTC(yyyy, mm - 1, 1));
      const end = new Date(Date.UTC(yyyy, mm, 0, 23, 59, 59));

      // Hash chain doğrulama sonucunu map'le
      const verifyResult = await getDb().execute<{
        event_id: string;
        is_valid: boolean;
        expected_hash: string;
        actual_hash: string;
        position: number;
      }>(sql`select * from verify_hash_chain(${req.authOrgId}::uuid)`);
      const verifyRows =
        (verifyResult as unknown as { rows: Array<{ event_id: string; is_valid: boolean; expected_hash: string; position: number }> }).rows ??
        [];
      const validityMap = new Map(
        verifyRows.map((r) => [r.event_id, { valid: r.is_valid, expected: r.expected_hash, position: r.position }]),
      );

      // Ay içi tüm event'ler
      const rows = await getDb()
        .select({
          id: attendanceEvents.id,
          type: attendanceEvents.type,
          server_time: attendanceEvents.server_time,
          client_time: attendanceEvents.client_time,
          user_id: attendanceEvents.user_id,
          full_name: users.full_name,
          email: users.email,
          department: users.department,
          location_id: attendanceEvents.location_id,
          latitude: attendanceEvents.latitude,
          longitude: attendanceEvents.longitude,
          distance_from_office_m: attendanceEvents.distance_from_office_m,
          verification_score: attendanceEvents.verification_score,
          verification_methods: attendanceEvents.verification_methods,
          flags: attendanceEvents.flags,
          review_status: attendanceEvents.review_status,
          review_reasons: attendanceEvents.review_reasons,
          hash: attendanceEvents.this_event_hash,
          prev_hash: attendanceEvents.previous_event_hash,
        })
        .from(attendanceEvents)
        .innerJoin(users, eq(users.id, attendanceEvents.user_id))
        .where(
          and(
            eq(attendanceEvents.org_id, req.authOrgId),
            gte(attendanceEvents.server_time, start),
            lte(attendanceEvents.server_time, end),
          ),
        )
        .orderBy(asc(attendanceEvents.server_time));

      const items = rows.map((r) => {
        const v = validityMap.get(r.id);
        return {
          id: r.id,
          type: r.type,
          server_time: r.server_time.toISOString(),
          client_time: r.client_time.toISOString(),
          user_id: r.user_id,
          full_name: r.full_name,
          email: r.email,
          department: r.department ?? '',
          location_id: r.location_id ?? '',
          latitude: r.latitude ?? '',
          longitude: r.longitude ?? '',
          distance_from_office_m: r.distance_from_office_m ?? '',
          verification_score: r.verification_score,
          verification_methods: (r.verification_methods ?? []).join('+'),
          flags: (r.flags ?? []).join(';'),
          review_status: r.review_status ?? 'approved',
          review_reasons: (r.review_reasons ?? []).join(';'),
          hash: r.hash ?? '',
          prev_hash: r.prev_hash ?? '',
          chain_valid: v?.valid ?? null,
          chain_position: v?.position ?? null,
        };
      });

      const total = items.length;
      const broken = items.filter((i) => i.chain_valid === false).length;

      if (q.format === 'csv') {
        const csvEsc = (v: string | number | boolean | null | undefined): string => {
          const s = v == null ? '' : String(v);
          if (s.includes('"') || s.includes(',') || s.includes('\n')) {
            return '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        };
        const headers = [
          'Event ID',
          'Tip',
          'Sunucu Zamanı (UTC)',
          'İstemci Zamanı (UTC)',
          'Kullanıcı',
          'E-posta',
          'Departman',
          'Lokasyon ID',
          'Enlem',
          'Boylam',
          'Ofis Mesafesi (m)',
          'Trust (0-100)',
          'Doğrulama Yöntemleri',
          'Bayraklar',
          'İnceleme Durumu',
          'İnceleme Sebepleri',
          'Hash',
          'Önceki Hash',
          'Chain Geçerli',
          'Chain Pozisyon',
        ];
        const lines = [
          headers.map(csvEsc).join(','),
          ...items.map((i) =>
            [
              i.id,
              i.type,
              i.server_time,
              i.client_time,
              i.full_name,
              i.email,
              i.department,
              i.location_id,
              i.latitude,
              i.longitude,
              i.distance_from_office_m,
              i.verification_score,
              i.verification_methods,
              i.flags,
              i.review_status,
              i.review_reasons,
              i.hash,
              i.prev_hash,
              i.chain_valid == null ? '' : i.chain_valid ? 'EVET' : 'HAYIR',
              i.chain_position ?? '',
            ]
              .map(csvEsc)
              .join(','),
          ),
        ];
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="audit-${q.month}.csv"`,
        );
        res.send('﻿' + lines.join('\n'));
        return;
      }

      res.json({
        month: q.month,
        total,
        valid: total - broken,
        broken,
        chain_integrity_pct: total > 0 ? Math.round(((total - broken) / total) * 1000) / 10 : 100,
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
  requireRole('manager', 'admin', 'owner'),
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
