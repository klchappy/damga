import { Router } from 'express';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { createMoodSchema, MOOD_EMOJI_SCORE } from '@damga/shared';
import { getDb, moods, users } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';

export const moodsRouter = Router();

/** Bugünün mood'u (kişisel) */
moodsRouter.get('/moods/today', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUserId) throw new HttpError(401, 'Yetki yok');
    const today = new Date().toISOString().slice(0, 10);
    const [m] = await getDb()
      .select()
      .from(moods)
      .where(and(eq(moods.user_id, req.authUserId), eq(moods.date, today)));
    res.json({ mood: m ?? null });
  } catch (err) {
    next(err);
  }
});

/** Mood ekle (günde 1, idempotent) */
moodsRouter.post('/moods', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUserId || !req.authOrgId) throw new HttpError(401, 'Yetki yok');
    const input = createMoodSchema.parse(req.body);
    const today = new Date().toISOString().slice(0, 10);
    const score = MOOD_EMOJI_SCORE[input.emoji] ?? 3;

    const [m] = await getDb()
      .insert(moods)
      .values({
        org_id: req.authOrgId,
        user_id: req.authUserId,
        emoji: input.emoji,
        score,
        date: today,
      })
      .onConflictDoUpdate({
        target: [moods.user_id, moods.date],
        set: { emoji: input.emoji, score },
      })
      .returning();
    res.status(201).json({ mood: m });
  } catch (err) {
    next(err);
  }
});

const teamQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.coerce.number().int().min(1).max(90).default(30),
});

/** Ekip mood — sadece manager. Bugün ya da son N gün özeti. */
moodsRouter.get(
  '/moods/team',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const q = teamQuery.parse(req.query);
      const since = new Date();
      since.setDate(since.getDate() - q.days);
      const sinceStr = since.toISOString().slice(0, 10);

      const rows = await getDb()
        .select({
          mood: moods,
          userName: users.full_name,
        })
        .from(moods)
        .leftJoin(users, eq(users.id, moods.user_id))
        .where(and(eq(moods.org_id, req.authOrgId), gte(moods.date, sinceStr)))
        .orderBy(desc(moods.date));

      // Agregat
      const avgRows = await getDb()
        .select({ avg: sql<number>`avg(${moods.score})::numeric(10,2)` })
        .from(moods)
        .where(and(eq(moods.org_id, req.authOrgId), gte(moods.date, sinceStr)));
      const avg = avgRows[0]?.avg;

      res.json({
        items: rows.map((r) => ({ ...r.mood, user_name: r.userName })),
        average_score: avg ? Number(avg) : null,
        days: q.days,
      });
    } catch (err) {
      next(err);
    }
  },
);
