import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { createUserSchema, updateUserSchema } from '@damga/shared';
import { getDb, users } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';

export const usersRouter = Router();

usersRouter.get('/users', requireAuth, requireRole('manager', 'admin', 'owner'), async (req, res, next) => {
  try {
    if (!req.authOrgId) throw new HttpError(401, "Yetki yok");
    const rows = await getDb()
      .select()
      .from(users)
      .where(eq(users.org_id, req.authOrgId));
    res.json({ items: rows });
  } catch (err) {
    next(err);
  }
});

usersRouter.post(
  '/users',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, "Yetki yok");
      const input = createUserSchema.parse(req.body);
      const [user] = await getDb()
        .insert(users)
        .values({ ...input, org_id: req.authOrgId })
        .returning();
      res.status(201).json({ user });
    } catch (err) {
      next(err);
    }
  },
);

usersRouter.patch(
  '/users/:id',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, "Yetki yok");
      const id = String(req.params.id ?? '').trim();
      const input = updateUserSchema.parse(req.body);
      const [user] = await getDb()
        .update(users)
        .set({ ...input, updated_at: new Date() })
        .where(and(eq(users.id, id), eq(users.org_id, req.authOrgId)))
        .returning();
      if (!user) throw new HttpError(404, "Bulunamadı");
      res.json({ user });
    } catch (err) {
      next(err);
    }
  },
);
