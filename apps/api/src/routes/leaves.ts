import { Router } from 'express';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { createLeaveSchema, rejectLeaveSchema } from '@damga/shared';
import { getDb, leaves, users } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole, requireScope } from '../middleware/auth';
import { dispatchWebhook } from '../modules/webhook-delivery';
import { createNotification } from '../lib/notifications';

export const leavesRouter = Router();

/**
 * İki tarih arasındaki iş gününü hesapla (hafta sonu hariç).
 *
 * FIX (bug): Önceki versiyon `new Date(YYYY-MM-DD)` ile parse + `setDate` mutate
 * kullanıyordu — DST geçişlerinde gün kayması ve `getDay()` local timezone
 * bağımlılığı vardı. Yeni: explicit UTC parse + ms aritmetiği + getUTCDay.
 */
function calcBusinessDays(start: string, end: string): number {
  const [sy, sm, sd] = start.split('-').map(Number) as [number, number, number];
  const [ey, em, ed] = end.split('-').map(Number) as [number, number, number];
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  if (startMs > endMs) return 0;
  let days = 0;
  const DAY_MS = 86_400_000;
  for (let t = startMs; t <= endMs; t += DAY_MS) {
    const dow = new Date(t).getUTCDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

const listQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  user_id: z.string().uuid().optional(),
});

leavesRouter.get('/leaves', requireAuth, requireScope('leaves:read'), async (req, res, next) => {
  try {
    if (!req.authOrgId) throw new HttpError(401, "Yetki yok");
    const q = listQuery.parse(req.query);
    const isManager = req.authUser
      ? ['manager', 'admin', 'owner'].includes(req.authUser.role)
      : true;
    const targetUserId = isManager ? q.user_id : req.authUserId;

    const conditions = [eq(leaves.org_id, req.authOrgId)];
    if (targetUserId) conditions.push(eq(leaves.user_id, targetUserId));
    if (q.status) conditions.push(eq(leaves.status, q.status));

    const rows = await getDb()
      .select({
        leave: leaves,
        userName: users.full_name,
      })
      .from(leaves)
      .leftJoin(users, eq(users.id, leaves.user_id))
      .where(and(...conditions))
      .orderBy(desc(leaves.created_at));

    res.json({
      items: rows.map((r) => ({
        ...r.leave,
        user: r.userName ? { id: r.leave.user_id, full_name: r.userName } : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

leavesRouter.post('/leaves', requireAuth, requireScope('leaves:write'), async (req, res, next) => {
  try {
    if (!req.authOrgId || !req.authUserId) throw new HttpError(401, "Yetki yok");
    const input = createLeaveSchema.parse(req.body);
    const businessDays = calcBusinessDays(input.start_date, input.end_date);
    const [leave] = await getDb()
      .insert(leaves)
      .values({
        org_id: req.authOrgId,
        user_id: req.authUserId,
        type: input.type,
        start_date: input.start_date,
        end_date: input.end_date,
        half_day: input.half_day,
        reason: input.reason,
        business_days: businessDays,
      })
      .returning();
    void dispatchWebhook({
      orgId: req.authOrgId,
      eventType: 'leave.created',
      payload: leave,
    });
    res.status(201).json({ leave });
  } catch (err) {
    next(err);
  }
});

leavesRouter.patch(
  '/leaves/:id/approve',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, "Yetki yok");
      const id = String(req.params.id ?? '').trim();
      const [leave] = await getDb()
        .update(leaves)
        .set({
          status: 'approved',
          approved_by: req.authUserId,
          approved_at: new Date(),
          updated_at: new Date(),
        })
        .where(and(eq(leaves.id, id), eq(leaves.org_id, req.authOrgId)))
        .returning();
      if (!leave) throw new HttpError(404, 'İzin bulunamadı');
      void dispatchWebhook({
        orgId: req.authOrgId,
        eventType: 'leave.approved',
        payload: leave,
      });
      void createNotification({
        orgId: req.authOrgId,
        userId: leave.user_id,
        type: 'leave_approved',
        title: '✅ İzin talebin onaylandı',
        body: `${leave.start_date} → ${leave.end_date}${leave.business_days ? ` (${leave.business_days} iş günü)` : ''}`,
        url: '/leaves',
        metadata: { leave_id: leave.id, type: leave.type },
      });
      res.json({ leave });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/admin/leaves/bulk { items: [{ user_email|user_id, type, start_date, end_date, status?, reason? }] }
 * Toplu izin oluşturma. status default = 'approved' (admin manuel kayıt).
 * email ile kullanıcı lookup; bulunamazsa o satır skipped'a düşer.
 */
const bulkLeaveSchema = z.object({
  default_status: z.enum(['pending', 'approved']).default('approved'),
  items: z
    .array(
      z.object({
        user_email: z.string().email().optional(),
        user_id: z.string().uuid().optional(),
        type: z.enum([
          'annual',
          'sick',
          'unpaid',
          'maternity',
          'paternity',
          'compassionate',
        ]),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(500),
});

leavesRouter.post(
  '/admin/leaves/bulk',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
      const body = bulkLeaveSchema.parse(req.body);

      // Email → user_id lookup (sadece bu org'un kullanıcılarından)
      // SECURITY: WHERE clause'a org_id filter eklendi (önceki versiyonda DB-level
      // filter yoktu, sadece post-fetch JS filter vardı — defense in depth zayıftı)
      const emails = Array.from(
        new Set(body.items.filter((i) => i.user_email).map((i) => i.user_email!)),
      );
      const userByEmail = new Map<string, string>();
      if (emails.length > 0) {
        const found = await getDb()
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(
            and(
              eq(users.org_id, req.authOrgId),
              inArray(users.email, emails),
            ),
          );
        for (const u of found) {
          userByEmail.set(u.email, u.id);
        }
      }

      // Direkt user_id verilen item'lar için: hepsini bu org'a ait olduğunu doğrula
      // (saldırgan başka org'un user_id'sini parametre olarak verebilir)
      const explicitUserIds = Array.from(
        new Set(body.items.filter((i) => i.user_id).map((i) => i.user_id!)),
      );
      const validOrgUserIds = new Set<string>();
      if (explicitUserIds.length > 0) {
        const found = await getDb()
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.org_id, req.authOrgId),
              inArray(users.id, explicitUserIds),
            ),
          );
        for (const u of found) validOrgUserIds.add(u.id);
      }

      let inserted = 0;
      const skipped: Array<{ row: number; reason: string }> = [];

      for (let i = 0; i < body.items.length; i++) {
        const item = body.items[i]!;
        let userId = item.user_id;
        // SECURITY: explicit user_id verildiyse org doğrulamasından geçmeli
        if (userId && !validOrgUserIds.has(userId)) {
          skipped.push({ row: i + 1, reason: 'user_not_in_org' });
          continue;
        }
        if (!userId && item.user_email) {
          userId = userByEmail.get(item.user_email);
        }
        if (!userId) {
          skipped.push({ row: i + 1, reason: 'user_not_found' });
          continue;
        }
        if (item.start_date > item.end_date) {
          skipped.push({ row: i + 1, reason: 'invalid_date_range' });
          continue;
        }

        const businessDays = calcBusinessDays(item.start_date, item.end_date);

        await getDb()
          .insert(leaves)
          .values({
            org_id: req.authOrgId,
            user_id: userId,
            type: item.type,
            start_date: item.start_date,
            end_date: item.end_date,
            reason: item.reason ?? null,
            status: body.default_status,
            approved_by: body.default_status === 'approved' ? req.authUserId : null,
            approved_at: body.default_status === 'approved' ? new Date() : null,
            business_days: businessDays,
          });
        inserted++;
      }

      res.status(201).json({ ok: true, inserted, skipped });
    } catch (err) {
      next(err);
    }
  },
);

leavesRouter.patch(
  '/leaves/:id/reject',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, "Yetki yok");
      const id = String(req.params.id ?? '').trim();
      const body = rejectLeaveSchema.parse(req.body);
      const [leave] = await getDb()
        .update(leaves)
        .set({
          status: 'rejected',
          approved_by: req.authUserId,
          approved_at: new Date(),
          rejection_reason: body.rejection_reason,
          updated_at: new Date(),
        })
        .where(and(eq(leaves.id, id), eq(leaves.org_id, req.authOrgId)))
        .returning();
      if (!leave) throw new HttpError(404, 'İzin bulunamadı');
      void dispatchWebhook({
        orgId: req.authOrgId,
        eventType: 'leave.rejected',
        payload: leave,
      });
      void createNotification({
        orgId: req.authOrgId,
        userId: leave.user_id,
        type: 'leave_rejected',
        title: '❌ İzin talebin reddedildi',
        body: body.rejection_reason ?? `${leave.start_date} → ${leave.end_date}`,
        url: '/leaves',
        metadata: { leave_id: leave.id, reason: body.rejection_reason },
      });
      res.json({ leave });
    } catch (err) {
      next(err);
    }
  },
);
