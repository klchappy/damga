import { Router } from 'express';
import { and, between, desc, eq, sql, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  createMenuSchema,
  updateMenuSchema,
  rsvpSchema,
  rateMenuSchema,
} from '@damga/shared';
import { getDb, menus, menuRsvps, users } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';

export const menusRouter = Router();

/** Bugünün menüsü (mutfak QR'ı için kısa endpoint) */
menusRouter.get('/menus/today', requireAuth, async (req, res, next) => {
  try {
    if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
    const today = new Date().toISOString().slice(0, 10);
    const rows = await getDb()
      .select()
      .from(menus)
      .where(and(eq(menus.org_id, req.authOrgId), eq(menus.date, today)))
      .orderBy(menus.created_at);
    res.json({ items: rows, date: today });
  } catch (err) {
    next(err);
  }
});

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

/**
 * POST /v1/menus — yeni menü yayınla.
 * Sadece admin/owner — manager dahil değil (yetki politikası).
 */
menusRouter.post(
  '/menus',
  requireAuth,
  requireRole('admin', 'owner'),
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

/**
 * POST /v1/admin/menus/bulk { items: [{ date, main_dish, description?, calories?, allergens?, is_vegetarian?, is_vegan? }] }
 * Toplu menü oluşturma (Excel import için).
 * Aynı org+date+location varsa atlar (skipped sayar).
 */
const bulkMenuSchema = z.object({
  items: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        main_dish: z.string().trim().min(1).max(200),
        description: z.string().max(1000).nullable().optional(),
        calories: z.number().int().nonnegative().nullable().optional(),
        allergens: z.array(z.string()).default([]),
        is_vegetarian: z.boolean().default(false),
        is_vegan: z.boolean().default(false),
        location_id: z.string().uuid().nullable().optional(),
      }),
    )
    .min(1)
    .max(366),
});

menusRouter.post(
  '/admin/menus/bulk',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
      const body = bulkMenuSchema.parse(req.body);

      let inserted = 0;
      const skipped: string[] = [];

      for (const item of body.items) {
        // Aynı tarihte var mı?
        const exist = await getDb()
          .select({ id: menus.id })
          .from(menus)
          .where(
            and(
              eq(menus.org_id, req.authOrgId),
              eq(menus.date, item.date),
              item.location_id
                ? eq(menus.location_id, item.location_id)
                : isNotNull(menus.id), // null location'lı kayıtlarda eşleştirme yok, hep ekle
            ),
          )
          .limit(1);
        if (exist.length > 0 && !item.location_id) {
          // Aynı tarihte non-locational menu varsa atla
          const sameDateGeneric = await getDb()
            .select({ id: menus.id })
            .from(menus)
            .where(
              and(
                eq(menus.org_id, req.authOrgId),
                eq(menus.date, item.date),
                sql`${menus.location_id} IS NULL`,
              ),
            )
            .limit(1);
          if (sameDateGeneric.length > 0) {
            skipped.push(item.date);
            continue;
          }
        }

        await getDb()
          .insert(menus)
          .values({
            org_id: req.authOrgId,
            location_id: item.location_id ?? null,
            date: item.date,
            main_dish: item.main_dish,
            description: item.description ?? null,
            calories: item.calories ?? null,
            allergens: item.allergens,
            is_vegetarian: item.is_vegetarian,
            is_vegan: item.is_vegan,
            created_by: req.authUserId,
          });
        inserted++;
      }

      res.status(201).json({ ok: true, inserted, skipped });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /v1/menus/:id — admin/owner menüyü düzenler.
 */
menusRouter.patch(
  '/menus/:id',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const input = updateMenuSchema.parse(req.body);

      const updates: Record<string, unknown> = {};
      if (input.date !== undefined) updates.date = input.date;
      if (input.main_dish !== undefined) updates.main_dish = input.main_dish;
      if (input.description !== undefined) updates.description = input.description;
      if (input.photo_url !== undefined) updates.photo_url = input.photo_url;
      if (input.calories !== undefined) updates.calories = input.calories;
      if (input.allergens !== undefined) updates.allergens = input.allergens;
      if (input.is_vegetarian !== undefined) updates.is_vegetarian = input.is_vegetarian;
      if (input.is_vegan !== undefined) updates.is_vegan = input.is_vegan;

      const [updated] = await getDb()
        .update(menus)
        .set(updates)
        .where(and(eq(menus.id, id), eq(menus.org_id, req.authOrgId)))
        .returning();
      if (!updated) throw new HttpError(404, 'Menü bulunamadı');
      res.json({ menu: updated });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /v1/menus/:id — admin/owner menüyü siler.
 * menu_rsvps cascade olarak silinir.
 */
menusRouter.delete(
  '/menus/:id',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const [deleted] = await getDb()
        .delete(menus)
        .where(and(eq(menus.id, id), eq(menus.org_id, req.authOrgId)))
        .returning({ id: menus.id });
      if (!deleted) throw new HttpError(404, 'Menü bulunamadı');
      res.json({ ok: true });
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

/**
 * POST /v1/menus/:id/rate — yıldız + yorum.
 *
 * Mutfaktaki QR'ı okutan çalışan buradan rating ve/veya comment gönderir.
 * En az biri zorunlu. Aynı menü+kullanıcı çiftinde upsert.
 */
menusRouter.post('/menus/:id/rate', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUserId || !req.authOrgId) throw new HttpError(401, 'Yetki yok');
    const id = String(req.params.id ?? '').trim();
    const body = rateMenuSchema.parse(req.body);

    if (body.rating === undefined && !body.comment) {
      throw new HttpError(400, 'Yıldız veya yorum girmelisin', 'EMPTY_FEEDBACK');
    }

    // Menü gerçekten bu org'a ait mi?
    const [menu] = await getDb()
      .select({ id: menus.id, org_id: menus.org_id })
      .from(menus)
      .where(eq(menus.id, id));
    if (!menu) throw new HttpError(404, 'Menü bulunamadı');
    if (menu.org_id !== req.authOrgId) throw new HttpError(403, 'Bu menüye erişim yok');

    const setPatch: Record<string, unknown> = { feedback_at: new Date() };
    if (body.rating !== undefined) setPatch.rating = body.rating;
    if (body.comment !== undefined) setPatch.comment = body.comment.trim() || null;

    await getDb()
      .insert(menuRsvps)
      .values({
        menu_id: id,
        user_id: req.authUserId,
        will_eat: true,
        rating: body.rating ?? null,
        comment: body.comment?.trim() || null,
        feedback_at: new Date(),
      })
      .onConflictDoUpdate({
        target: [menuRsvps.menu_id, menuRsvps.user_id],
        set: setPatch,
      });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/menus/:id/feedback — admin/manager: bu menüye gelen yorumlar + puanlar.
 */
menusRouter.get(
  '/menus/:id/feedback',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();

      const [menu] = await getDb()
        .select()
        .from(menus)
        .where(and(eq(menus.id, id), eq(menus.org_id, req.authOrgId)));
      if (!menu) throw new HttpError(404, 'Menü bulunamadı');

      const rows = await getDb()
        .select({
          rsvp: menuRsvps,
          user_name: users.full_name,
          department: users.department,
        })
        .from(menuRsvps)
        .leftJoin(users, eq(users.id, menuRsvps.user_id))
        .where(
          and(
            eq(menuRsvps.menu_id, id),
            // Yorum veya puan vermiş olanları getir (sadece will_eat=true olanları değil)
          ),
        )
        .orderBy(desc(menuRsvps.feedback_at));

      const items = rows
        .filter((r) => r.rsvp.rating !== null || r.rsvp.comment !== null)
        .map((r) => ({
          user_name: r.user_name,
          department: r.department,
          rating: r.rsvp.rating,
          comment: r.rsvp.comment,
          feedback_at: r.rsvp.feedback_at,
        }));

      const [stats] = await getDb()
        .select({
          avg_rating: sql<number>`avg(${menuRsvps.rating})::numeric(10,2)`,
          rating_count: sql<number>`count(${menuRsvps.rating})::int`,
          comment_count: sql<number>`count(${menuRsvps.comment})::int`,
        })
        .from(menuRsvps)
        .where(and(eq(menuRsvps.menu_id, id), isNotNull(menuRsvps.feedback_at)));

      res.json({
        menu,
        items,
        stats: {
          avg_rating: stats?.avg_rating ? Number(stats.avg_rating) : null,
          rating_count: stats?.rating_count ?? 0,
          comment_count: stats?.comment_count ?? 0,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);
