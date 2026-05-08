import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createLeaveSchema, rejectLeaveSchema } from '@damga/shared';
import { getDb, leaves, users } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole, requireScope } from '../middleware/auth';
import { dispatchWebhook } from '../modules/webhook-delivery';
import { createNotification } from '../lib/notifications';

export const leavesRouter = Router();

function calcBusinessDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  let days = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
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
        business_days: String(businessDays),
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
