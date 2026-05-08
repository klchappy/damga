import { Router } from 'express';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  getDb,
  shiftTemplates,
  shiftAssignments,
  overtimeRecords,
  users,
  locations,
} from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';
import { awardXp } from '../lib/xp';
import { logger } from '../config/logger';

export const shiftsRouter = Router();

const HHMM = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'HH:MM formatında olmalı (ör. 09:00)');

// ─────────────────────────────────────────────────────────────────────────
// SHIFT TEMPLATES
// ─────────────────────────────────────────────────────────────────────────

shiftsRouter.get('/shifts', requireAuth, async (req, res, next) => {
  try {
    if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
    const includeInactive = req.query.all === '1';
    const conds = [eq(shiftTemplates.org_id, req.authOrgId)];
    if (!includeInactive) conds.push(eq(shiftTemplates.is_active, true));
    const items = await getDb()
      .select({
        id: shiftTemplates.id,
        org_id: shiftTemplates.org_id,
        location_id: shiftTemplates.location_id,
        name: shiftTemplates.name,
        start_time: shiftTemplates.start_time,
        end_time: shiftTemplates.end_time,
        break_minutes: shiftTemplates.break_minutes,
        color: shiftTemplates.color,
        overtime_threshold_minutes: shiftTemplates.overtime_threshold_minutes,
        is_active: shiftTemplates.is_active,
        created_at: shiftTemplates.created_at,
        location_name: locations.name,
      })
      .from(shiftTemplates)
      .leftJoin(locations, eq(locations.id, shiftTemplates.location_id))
      .where(and(...conds))
      .orderBy(asc(shiftTemplates.name));
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

const createShiftSchema = z.object({
  name: z.string().trim().min(2).max(80),
  location_id: z.string().uuid().nullable().optional(),
  start_time: HHMM,
  end_time: HHMM,
  break_minutes: z.number().int().min(0).max(240).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  overtime_threshold_minutes: z.number().int().min(0).max(120).optional(),
});

shiftsRouter.post(
  '/shifts',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
      const input = createShiftSchema.parse(req.body);
      const [r] = await getDb()
        .insert(shiftTemplates)
        .values({
          org_id: req.authOrgId,
          location_id: input.location_id ?? null,
          name: input.name,
          start_time: input.start_time,
          end_time: input.end_time,
          break_minutes: input.break_minutes ?? 60,
          color: input.color ?? '#f97316',
          overtime_threshold_minutes: input.overtime_threshold_minutes ?? 15,
          created_by: req.authUserId,
        })
        .returning();
      res.status(201).json({ shift: r });
    } catch (err) {
      next(err);
    }
  },
);

const updateShiftSchema = createShiftSchema.partial().extend({
  is_active: z.boolean().optional(),
});

shiftsRouter.patch(
  '/shifts/:id',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const input = updateShiftSchema.parse(req.body);
      const updates: Record<string, unknown> = { updated_at: new Date() };
      for (const k of [
        'name',
        'location_id',
        'start_time',
        'end_time',
        'break_minutes',
        'color',
        'overtime_threshold_minutes',
        'is_active',
      ] as const) {
        if (input[k] !== undefined) updates[k] = input[k];
      }
      const [r] = await getDb()
        .update(shiftTemplates)
        .set(updates)
        .where(and(eq(shiftTemplates.id, id), eq(shiftTemplates.org_id, req.authOrgId)))
        .returning();
      if (!r) throw new HttpError(404, 'Vardiya şablonu bulunamadı');
      res.json({ shift: r });
    } catch (err) {
      next(err);
    }
  },
);

shiftsRouter.delete(
  '/shifts/:id',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      // Soft delete (atamalar olabilir)
      await getDb()
        .update(shiftTemplates)
        .set({ is_active: false, updated_at: new Date() })
        .where(and(eq(shiftTemplates.id, id), eq(shiftTemplates.org_id, req.authOrgId)));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────
// SHIFT ASSIGNMENTS
// ─────────────────────────────────────────────────────────────────────────

const listAssignmentsQuery = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  user_id: z.string().uuid().optional(),
});

shiftsRouter.get(
  '/shift-assignments',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const q = listAssignmentsQuery.parse(req.query);
      const conds = [
        eq(shiftAssignments.org_id, req.authOrgId),
        gte(shiftAssignments.shift_date, q.date_from),
        lte(shiftAssignments.shift_date, q.date_to),
      ];
      if (q.user_id) conds.push(eq(shiftAssignments.user_id, q.user_id));
      const rows = await getDb()
        .select({
          a: shiftAssignments,
          t_name: shiftTemplates.name,
          t_color: shiftTemplates.color,
          t_start: shiftTemplates.start_time,
          t_end: shiftTemplates.end_time,
          u_name: users.full_name,
          u_avatar: users.avatar_url,
          u_dept: users.department,
        })
        .from(shiftAssignments)
        .innerJoin(shiftTemplates, eq(shiftTemplates.id, shiftAssignments.shift_template_id))
        .innerJoin(users, eq(users.id, shiftAssignments.user_id))
        .where(and(...conds))
        .orderBy(asc(shiftAssignments.shift_date));
      res.json({
        items: rows.map((r) => ({
          ...r.a,
          template_name: r.t_name,
          template_color: r.t_color,
          template_start: r.t_start,
          template_end: r.t_end,
          user_name: r.u_name,
          user_avatar: r.u_avatar,
          user_department: r.u_dept,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

const createAssignmentSchema = z.object({
  shift_template_id: z.string().uuid(),
  user_id: z.string().uuid(),
  shift_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  override_start: HHMM.nullable().optional(),
  override_end: HHMM.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const bulkAssignmentSchema = z.union([
  createAssignmentSchema,
  z.object({ assignments: z.array(createAssignmentSchema).min(1).max(200) }),
]);

shiftsRouter.post(
  '/shift-assignments',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
      const parsed = bulkAssignmentSchema.parse(req.body);
      const list =
        'assignments' in parsed ? parsed.assignments : [parsed];

      // Şablonların org doğrulaması
      const templateIds = Array.from(new Set(list.map((x) => x.shift_template_id)));
      const tpls = await getDb()
        .select({ id: shiftTemplates.id, org_id: shiftTemplates.org_id })
        .from(shiftTemplates)
        .where(inArray(shiftTemplates.id, templateIds));
      for (const t of tpls) {
        if (t.org_id !== req.authOrgId) {
          throw new HttpError(403, 'Şablon bu org\'a ait değil');
        }
      }

      const inserts = await getDb()
        .insert(shiftAssignments)
        .values(
          list.map((x) => ({
            org_id: req.authOrgId!,
            shift_template_id: x.shift_template_id,
            user_id: x.user_id,
            shift_date: x.shift_date,
            override_start: x.override_start ?? null,
            override_end: x.override_end ?? null,
            notes: x.notes ?? null,
            created_by: req.authUserId!,
          })),
        )
        .onConflictDoNothing()
        .returning();

      logger.info(
        { count: inserts.length, by: req.authUserId },
        '📅 Vardiya ataması oluşturuldu',
      );

      res.status(201).json({ items: inserts, count: inserts.length });
    } catch (err) {
      next(err);
    }
  },
);

const updateAssignmentSchema = z.object({
  shift_template_id: z.string().uuid().optional(),
  override_start: HHMM.nullable().optional(),
  override_end: HHMM.nullable().optional(),
  status: z.enum(['scheduled', 'completed', 'absent', 'swapped']).optional(),
  notes: z.string().max(500).nullable().optional(),
});

shiftsRouter.patch(
  '/shift-assignments/:id',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const input = updateAssignmentSchema.parse(req.body);
      const updates: Record<string, unknown> = { updated_at: new Date() };
      for (const k of [
        'shift_template_id',
        'override_start',
        'override_end',
        'status',
        'notes',
      ] as const) {
        if (input[k] !== undefined) updates[k] = input[k];
      }
      const [r] = await getDb()
        .update(shiftAssignments)
        .set(updates)
        .where(and(eq(shiftAssignments.id, id), eq(shiftAssignments.org_id, req.authOrgId)))
        .returning();
      if (!r) throw new HttpError(404, 'Atama bulunamadı');
      res.json({ assignment: r });
    } catch (err) {
      next(err);
    }
  },
);

shiftsRouter.delete(
  '/shift-assignments/:id',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      await getDb()
        .delete(shiftAssignments)
        .where(and(eq(shiftAssignments.id, id), eq(shiftAssignments.org_id, req.authOrgId)));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

/** Çalışan kendi yaklaşan vardiyalarını görür */
shiftsRouter.get('/me/shifts', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUserId) throw new HttpError(401, 'Yetki yok');
    const q = z
      .object({
        date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(req.query);
    const today = new Date();
    const fromStr =
      q.date_from ?? today.toISOString().slice(0, 10); // bugünden
    const toDate = new Date(today);
    toDate.setDate(toDate.getDate() + 30);
    const toStr = q.date_to ?? toDate.toISOString().slice(0, 10);

    const rows = await getDb()
      .select({
        a: shiftAssignments,
        t_name: shiftTemplates.name,
        t_color: shiftTemplates.color,
        t_start: shiftTemplates.start_time,
        t_end: shiftTemplates.end_time,
        loc_name: locations.name,
      })
      .from(shiftAssignments)
      .innerJoin(shiftTemplates, eq(shiftTemplates.id, shiftAssignments.shift_template_id))
      .leftJoin(locations, eq(locations.id, shiftTemplates.location_id))
      .where(
        and(
          eq(shiftAssignments.user_id, req.authUserId),
          gte(shiftAssignments.shift_date, fromStr),
          lte(shiftAssignments.shift_date, toStr),
        ),
      )
      .orderBy(asc(shiftAssignments.shift_date));
    res.json({
      items: rows.map((r) => ({
        ...r.a,
        template_name: r.t_name,
        template_color: r.t_color,
        template_start: r.t_start,
        template_end: r.t_end,
        location_name: r.loc_name,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// OVERTIME
// ─────────────────────────────────────────────────────────────────────────

shiftsRouter.get('/overtime', requireAuth, async (req, res, next) => {
  try {
    if (!req.authOrgId || !req.authUser) throw new HttpError(401, 'Yetki yok');
    const q = z
      .object({
        status: z.enum(['pending', 'approved', 'rejected']).optional(),
        user_id: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);

    const isManager = ['manager', 'admin', 'owner'].includes(req.authUser.role);

    const conds = [eq(overtimeRecords.org_id, req.authOrgId)];
    if (q.status) conds.push(eq(overtimeRecords.status, q.status));
    if (q.user_id && isManager) conds.push(eq(overtimeRecords.user_id, q.user_id));
    if (!isManager) {
      // Çalışan sadece kendininkini görür
      conds.push(eq(overtimeRecords.user_id, req.authUser.id));
    }

    const rows = await getDb()
      .select({
        o: overtimeRecords,
        u_name: users.full_name,
        u_dept: users.department,
      })
      .from(overtimeRecords)
      .innerJoin(users, eq(users.id, overtimeRecords.user_id))
      .where(and(...conds))
      .orderBy(desc(overtimeRecords.created_at))
      .limit(q.limit);

    res.json({
      items: rows.map((r) => ({
        ...r.o,
        user_name: r.u_name,
        user_department: r.u_dept,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const approveOvertimeSchema = z.object({
  xp_bonus: z.number().int().min(0).max(500).optional(), // onayda opsiyonel XP bonusu
  notes: z.string().max(500).nullable().optional(),
});

shiftsRouter.post(
  '/overtime/:id/approve',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const body = approveOvertimeSchema.parse(req.body);
      const db = getDb();

      const [rec] = await db
        .select()
        .from(overtimeRecords)
        .where(
          and(eq(overtimeRecords.id, id), eq(overtimeRecords.org_id, req.authOrgId)),
        );
      if (!rec) throw new HttpError(404, 'Kayıt bulunamadı');
      if (rec.status !== 'pending')
        throw new HttpError(400, `Bu kayıt zaten ${rec.status}`, 'NOT_PENDING');

      let xpTxId: string | null = null;
      if ((body.xp_bonus ?? 0) > 0) {
        const xp = await awardXp({
          orgId: req.authOrgId,
          userId: rec.user_id,
          source: 'overtime_approved',
          amount: body.xp_bonus!,
          description: `Fazla mesai onayı (+${rec.overtime_minutes} dk)`,
          refId: rec.id,
          refType: 'overtime',
        });
        xpTxId = xp.transaction_id;
      }

      const [updated] = await db
        .update(overtimeRecords)
        .set({
          status: 'approved',
          approved_by: req.authUserId,
          approved_at: new Date(),
          xp_transaction_id: xpTxId,
          reason: body.notes ?? rec.reason,
        })
        .where(eq(overtimeRecords.id, id))
        .returning();

      logger.info(
        { id, by: req.authUserId, xp: body.xp_bonus ?? 0 },
        '✅ Fazla mesai onaylandı',
      );

      res.json({ ok: true, record: updated });
    } catch (err) {
      next(err);
    }
  },
);

const rejectOvertimeSchema = z.object({
  rejection_reason: z.string().trim().min(2).max(500),
});

shiftsRouter.post(
  '/overtime/:id/reject',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const body = rejectOvertimeSchema.parse(req.body);
      const db = getDb();

      const [rec] = await db
        .select()
        .from(overtimeRecords)
        .where(
          and(eq(overtimeRecords.id, id), eq(overtimeRecords.org_id, req.authOrgId)),
        );
      if (!rec) throw new HttpError(404, 'Kayıt bulunamadı');
      if (rec.status !== 'pending')
        throw new HttpError(400, `Bu kayıt zaten ${rec.status}`, 'NOT_PENDING');

      const [updated] = await db
        .update(overtimeRecords)
        .set({
          status: 'rejected',
          approved_by: req.authUserId,
          approved_at: new Date(),
          rejection_reason: body.rejection_reason,
        })
        .where(eq(overtimeRecords.id, id))
        .returning();

      logger.info({ id, by: req.authUserId }, '❌ Fazla mesai reddedildi');
      res.json({ ok: true, record: updated });
    } catch (err) {
      next(err);
    }
  },
);

/** Çalışan kendi fazla mesai sebebini ekleyebilir (pending iken) */
const setReasonSchema = z.object({ reason: z.string().trim().min(1).max(500) });
shiftsRouter.patch('/overtime/:id/reason', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUserId) throw new HttpError(401, 'Yetki yok');
    const id = String(req.params.id ?? '').trim();
    const body = setReasonSchema.parse(req.body);

    const [rec] = await getDb()
      .select()
      .from(overtimeRecords)
      .where(
        and(eq(overtimeRecords.id, id), eq(overtimeRecords.user_id, req.authUserId)),
      );
    if (!rec) throw new HttpError(404, 'Kayıt bulunamadı');
    if (rec.status !== 'pending')
      throw new HttpError(400, 'Bu kayıt artık düzenlenemez', 'NOT_PENDING');

    const [updated] = await getDb()
      .update(overtimeRecords)
      .set({ reason: body.reason })
      .where(eq(overtimeRecords.id, id))
      .returning();
    res.json({ ok: true, record: updated });
  } catch (err) {
    next(err);
  }
});

/** Sayım: bekleyen overtime sayısı (Admin Home badge için) */
shiftsRouter.get(
  '/overtime/pending-count',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const [r] = await getDb()
        .select({ c: sql<number>`count(*)::int` })
        .from(overtimeRecords)
        .where(
          and(
            eq(overtimeRecords.org_id, req.authOrgId),
            eq(overtimeRecords.status, 'pending'),
          ),
        );
      res.json({ count: r?.c ?? 0 });
    } catch (err) {
      next(err);
    }
  },
);
