import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import {
  countUnread,
  listMyNotifications,
  markAllRead,
  markRead,
} from '../lib/notifications';

export const notificationsRouter = Router();

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
