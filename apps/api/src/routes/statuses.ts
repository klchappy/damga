import { Router } from 'express';
import { and, desc, eq, gt } from 'drizzle-orm';
import { createStatusSchema } from '@damga/shared';
import { getDb, statuses, users } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';

export const statusesRouter = Router();

/** Status'umu yayınla (gün sonuna kadar default expire) */
statusesRouter.post('/statuses', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUserId || !req.authOrgId) throw new HttpError(401, 'Yetki yok');
    const input = createStatusSchema.parse(req.body);
    const expiresAt = input.expires_at
      ? new Date(input.expires_at)
      : (() => {
          const d = new Date();
          d.setHours(23, 59, 59, 999);
          return d;
        })();
    // Önce mevcut status'umu sil (kişi başına 1 aktif status)
    await getDb().delete(statuses).where(eq(statuses.user_id, req.authUserId));
    const [s] = await getDb()
      .insert(statuses)
      .values({
        org_id: req.authOrgId,
        user_id: req.authUserId,
        status_type: input.status_type,
        note: input.note,
        expires_at: expiresAt,
      })
      .returning();
    res.status(201).json({ status: s });
  } catch (err) {
    next(err);
  }
});

statusesRouter.delete('/statuses/current', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUserId) throw new HttpError(401, 'Yetki yok');
    await getDb().delete(statuses).where(eq(statuses.user_id, req.authUserId));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Ekip status'u — sadece manager */
statusesRouter.get(
  '/statuses/team',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const now = new Date();
      const rows = await getDb()
        .select({
          status: statuses,
          userName: users.full_name,
          userEmail: users.email,
          userAvatar: users.avatar_url,
        })
        .from(statuses)
        .leftJoin(users, eq(users.id, statuses.user_id))
        .where(and(eq(statuses.org_id, req.authOrgId), gt(statuses.expires_at, now)))
        .orderBy(desc(statuses.created_at));
      res.json({
        items: rows.map((r) => ({
          ...r.status,
          user: r.userName
            ? { full_name: r.userName, email: r.userEmail, avatar_url: r.userAvatar }
            : null,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);
