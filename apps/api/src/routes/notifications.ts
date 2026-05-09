import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, pushSubscriptions } from '@damga/db';
import { requireAuth } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { env } from '../config/env';
import {
  countUnread,
  listMyNotifications,
  markAllRead,
  markRead,
} from '../lib/notifications';

export const notificationsRouter = Router();

/** GET /v1/push/vapid-public-key — frontend bunu alıp subscribe ederken kullanır */
notificationsRouter.get('/push/vapid-public-key', (_req, res) => {
  res.json({ key: env.VAPID_PUBLIC_KEY ?? null });
});

/** POST /v1/me/push-subscriptions { endpoint, keys: { p256dh, auth } } */
const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  user_agent: z.string().optional(),
});

notificationsRouter.post(
  '/me/push-subscriptions',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
      const body = subscribeSchema.parse(req.body);
      const db = getDb();

      // Aynı endpoint zaten kayıtlı mı?
      const [exist] = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, body.endpoint));

      if (exist) {
        // Reaktif et + keys/user_agent güncelle
        await db
          .update(pushSubscriptions)
          .set({
            user_id: req.authUserId,
            org_id: req.authOrgId,
            p256dh: body.keys.p256dh,
            auth: body.keys.auth,
            user_agent: body.user_agent ?? null,
            is_active: true,
            last_used_at: new Date(),
          })
          .where(eq(pushSubscriptions.id, exist.id));
        res.json({ ok: true, id: exist.id, reactivated: true });
        return;
      }

      const [created] = await db
        .insert(pushSubscriptions)
        .values({
          org_id: req.authOrgId,
          user_id: req.authUserId,
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          user_agent: body.user_agent ?? null,
        })
        .returning({ id: pushSubscriptions.id });

      res.status(201).json({ ok: true, id: created?.id });
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /v1/me/push-subscriptions { endpoint } — unsubscribe */
notificationsRouter.delete(
  '/me/push-subscriptions',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!req.authUserId) throw new HttpError(401, 'Yetki yok');
      const body = z.object({ endpoint: z.string().url() }).parse(req.body);
      await getDb()
        .update(pushSubscriptions)
        .set({ is_active: false })
        .where(
          and(
            eq(pushSubscriptions.endpoint, body.endpoint),
            eq(pushSubscriptions.user_id, req.authUserId),
          ),
        );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

notificationsRouter.get('/me/notifications', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUserId) throw new HttpError(401, 'Yetki yok');
    const q = z
      .object({
        unread: z.enum(['1', '0']).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(req.query);
    const items = await listMyNotifications(req.authUserId, {
      limit: q.limit,
      unreadOnly: q.unread === '1',
    });
    const unread_count = await countUnread(req.authUserId);
    res.json({ items, unread_count });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post(
  '/me/notifications/:id/read',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!req.authUserId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      await markRead(req.authUserId, id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

notificationsRouter.post(
  '/me/notifications/mark-all-read',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!req.authUserId) throw new HttpError(401, 'Yetki yok');
      await markAllRead(req.authUserId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
