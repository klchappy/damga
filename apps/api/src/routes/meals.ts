import { Router } from 'express';
import crypto from 'node:crypto';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, kitchenQrs, mealFeedbacks, users } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';
import { awardXp } from '../lib/xp';

export const mealsRouter = Router();

/** Bugünün tarihi (Europe/Istanbul, YYYY-MM-DD) */
function todayInIstanbul(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

/**
 * GET /v1/kitchen-qrs — owner/admin/manager hepsini görür
 *   ?include_archived=1 → pasifler dahil
 */
mealsRouter.get(
  '/kitchen-qrs',
  requireAuth,
  requireRole('owner', 'admin', 'manager'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const includeArchived = req.query.include_archived === '1';
      const conditions = [eq(kitchenQrs.org_id, req.authOrgId)];
      if (!includeArchived) conditions.push(eq(kitchenQrs.is_active, true));
      const items = await getDb()
        .select()
        .from(kitchenQrs)
        .where(and(...conditions))
        .orderBy(desc(kitchenQrs.created_at));
      res.json({ items });
    } catch (err) {
      next(err);
    }
  },
);

/** POST /v1/kitchen-qrs — yalnız owner/admin */
const createKitchenSchema = z.object({
  name: z.string().trim().min(2).max(100),
});

mealsRouter.post(
  '/kitchen-qrs',
  requireAuth,
  requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUser?.id) throw new HttpError(401, 'Yetki yok');
      const body = createKitchenSchema.parse(req.body);
      const token = crypto.randomBytes(24).toString('base64url'); // 32 char
      const [created] = await getDb()
        .insert(kitchenQrs)
        .values({
          org_id: req.authOrgId,
          name: body.name,
          token,
          created_by: req.authUser.id,
        })
        .returning();
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /v1/kitchen-qrs/:id — soft archive */
mealsRouter.delete(
  '/kitchen-qrs/:id',
  requireAuth,
  requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = z.string().uuid().parse(req.params.id);
      const [updated] = await getDb()
        .update(kitchenQrs)
        .set({ is_active: false, archived_at: new Date() })
        .where(and(eq(kitchenQrs.id, id), eq(kitchenQrs.org_id, req.authOrgId)))
        .returning();
      if (!updated) throw new HttpError(404, 'Bulunamadı');
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /v1/me/meal-feedback/today — bugün ben feedback verdim mi?
 * Personel mutfak QR'ı okuttuktan sonra gösterim için.
 */
mealsRouter.get('/me/meal-feedback/today', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUser?.id) throw new HttpError(401, 'Yetki yok');
    const today = todayInIstanbul();
    const [row] = await getDb()
      .select()
      .from(mealFeedbacks)
      .where(and(eq(mealFeedbacks.user_id, req.authUser.id), eq(mealFeedbacks.ate_on, today)));
    res.json({ today, has_feedback: !!row, feedback: row ?? null });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/meal-feedback — personel feedback gönderir
 * Body: { token, rating (1-5), comment? }
 * - Token üzerinden kitchen_qr çözülür, org_id doğrulanır.
 * - Aynı kullanıcı bugün için zaten feedback varsa 409.
 * - Başarıda 30 XP "meal_feedback" kaynağıyla eklenir.
 */
const submitFeedbackSchema = z.object({
  token: z.string().trim().min(8).max(100),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});

mealsRouter.post('/meal-feedback', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUser?.id || !req.authOrgId) throw new HttpError(401, 'Yetki yok');
    const body = submitFeedbackSchema.parse(req.body);

    // QR'ı doğrula — aynı org'a ait + aktif olmalı
    const [qr] = await getDb()
      .select()
      .from(kitchenQrs)
      .where(
        and(
          eq(kitchenQrs.token, body.token),
          eq(kitchenQrs.org_id, req.authOrgId),
          eq(kitchenQrs.is_active, true),
        ),
      );
    if (!qr) throw new HttpError(404, 'QR geçersiz veya devre dışı');

    const today = todayInIstanbul();

    // Günde 1 kez kuralı — pre-check
    const [existing] = await getDb()
      .select({ id: mealFeedbacks.id })
      .from(mealFeedbacks)
      .where(
        and(eq(mealFeedbacks.user_id, req.authUser.id), eq(mealFeedbacks.ate_on, today)),
      );
    if (existing) {
      throw new HttpError(
        409,
        'Bugün için zaten geri bildirim verdiniz. Yarın tekrar deneyin.',
      );
    }

    const [created] = await getDb()
      .insert(mealFeedbacks)
      .values({
        org_id: req.authOrgId,
        user_id: req.authUser.id,
        kitchen_qr_id: qr.id,
        rating: body.rating,
        comment: body.comment ?? null,
        ate_on: today,
      })
      .returning();

    // XP ödülü — sessiz fail (XP eklenmese bile feedback başarılı sayılır)
    try {
      await awardXp({
        userId: req.authUser.id,
        orgId: req.authOrgId,
        amount: 30,
        source: 'meal_feedback',
        description: `Yemek geri bildirimi: ${qr.name} (${body.rating}⭐)`,
        refId: qr.id,
        refType: 'kitchen_qr',
        metadata: { rating: body.rating },
      });
    } catch {
      /* awardXp hatası feedback'i bozmasin */
    }

    res.status(201).json({
      feedback: created,
      xp_awarded: 30,
      kitchen_name: qr.name,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/admin/meal-feedback — owner/admin/manager için rapor
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD (varsayılan: son 30 gün)
 *   ?kitchen_qr_id=...
 * Dönen: per-day özet + ham yorumlar.
 */
mealsRouter.get(
  '/admin/meal-feedback',
  requireAuth,
  requireRole('owner', 'admin', 'manager'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const from = (req.query.from as string | undefined) ?? undefined;
      const to = (req.query.to as string | undefined) ?? undefined;
      const qrFilter = req.query.kitchen_qr_id as string | undefined;

      const conditions = [eq(mealFeedbacks.org_id, req.authOrgId)];
      if (from) conditions.push(gte(mealFeedbacks.ate_on, from));
      if (to) conditions.push(sql`${mealFeedbacks.ate_on} <= ${to}`);
      if (qrFilter) conditions.push(eq(mealFeedbacks.kitchen_qr_id, qrFilter));

      const items = await getDb()
        .select({
          id: mealFeedbacks.id,
          ate_on: mealFeedbacks.ate_on,
          rating: mealFeedbacks.rating,
          comment: mealFeedbacks.comment,
          created_at: mealFeedbacks.created_at,
          kitchen_qr_id: mealFeedbacks.kitchen_qr_id,
          kitchen_name: kitchenQrs.name,
          user_id: mealFeedbacks.user_id,
          user_name: users.full_name,
          user_email: users.email,
        })
        .from(mealFeedbacks)
        .leftJoin(kitchenQrs, eq(mealFeedbacks.kitchen_qr_id, kitchenQrs.id))
        .leftJoin(users, eq(mealFeedbacks.user_id, users.id))
        .where(and(...conditions))
        .orderBy(desc(mealFeedbacks.ate_on), desc(mealFeedbacks.created_at))
        .limit(500);

      // Günlük özet
      const summary = await getDb()
        .select({
          ate_on: mealFeedbacks.ate_on,
          count: sql<number>`count(*)::int`,
          avg_rating: sql<number>`avg(${mealFeedbacks.rating})::float`,
        })
        .from(mealFeedbacks)
        .where(and(...conditions))
        .groupBy(mealFeedbacks.ate_on)
        .orderBy(desc(mealFeedbacks.ate_on))
        .limit(60);

      res.json({ items, summary });
    } catch (err) {
      next(err);
    }
  },
);
