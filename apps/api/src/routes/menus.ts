import { Router } from 'express';
import { and, between, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { createMenuSchema, rsvpSchema, rateMenuSchema } from '@damga/shared';
import { getDb, menus, menuRsvps } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';

export const menusRouter = Router();

const listQuery = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  location_id: z.string().uuid().optional(),
});

menusRouter.get('/menus', requireAuth, async (req, res, next) => {
  try {
    if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
    const q = listQuery.parse(req.query);
    const today = new Date().toISOString().slice(0, 10);
    const from = q.date_from ?? today;
    const to = q.date_to ?? today;

    const conditions = [
      eq(menus.org_id, req.authOrgId),
      between(menus.date, from, to),
    ];
    if (q.location_id) conditions.push(eq(menus.location_id, q.location_id));

    const rows = await getDb()
      .select()
      .from(menus)
      .where(and(...conditions))
      .orderBy(menus.date);

    // RSVP count + avg rating
    const enriched = await Promise.all(
      rows.map(async (m) => {
        const [stats] = await getDb()
          .select({
            rsvp_count: sql<number>`count(*) filter (where ${menuRsvps.will_eat} = true)::int`,
            avg_rating: sql<number>`avg(${menuRsvps.rating})::numeric(10,2)`,
          })
          .from(menuRsvps)
          .where(eq(menuRsvps.menu_id, m.id));
        return {
          ...m,
          rsvp_count: stats?.rsvp_count ?? 0,
          avg_rating: stats?.avg_rating ? Number(stats.avg_rating) : null,
        };
      }),
    );

    res.json({ items: enriched });
  } catch (err) {
    next(err);
  }
});

menusRouter.post(
  '/menus',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
      const input = createMenuSchema.parse(req.body);
      const [m] = await getDb()
        .insert(menus)
        .values({ ...input, org_id: req.authOrgId, created_by: req.authUserId })
        .returning();
      res.status(201).json({ menu: m });
    } catch (err) {
      next(err);
    }
  },
);

menusRouter.post('/menus/:id/rsvp', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUserId) throw new HttpError(401, 'Yetki yok');
    const id = String(req.params.id ?? '').trim();
    const body = rsvpSchema.parse(req.body);
    await getDb()
      .insert(menuRsvps)
      .values({ menu_id: id, user_id: req.authUserId, will_eat: body.will_eat })
      .onConflictDoUpdate({
        target: [menuRsvps.menu_id, menuRsvps.user_id],
        set: { will_eat: body.will_eat },
      });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

menusRouter.post('/menus/:id/rate', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUserId) throw new HttpError(401, 'Yetki yok');
    const id = String(req.params.id ?? '').trim();
    const body = rateMenuSchema.parse(req.body);
    await getDb()
      .insert(menuRsvps)
      .values({
        menu_id: id,
        user_id: req.authUserId,
        will_eat: true,
        rating: body.rating,
      })
      .onConflictDoUpdate({
        target: [menuRsvps.menu_id, menuRsvps.user_id],
        set: { rating: body.rating },
      });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
