import { Router } from 'express';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, users, xpTransactions } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';
import { awardXp } from '../lib/xp';
import { logger } from '../config/logger';

export const leaderboardRouter = Router();

const listQuery = z.object({
  period: z.enum(['weekly', 'monthly', 'all']).default('weekly'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function getPeriodStart(period: 'weekly' | 'monthly' | 'all'): Date | null {
  const now = new Date();
  if (period === 'weekly') {
    // Pazartesi 00:00
    const d = new Date(now);
    const dow = (d.getDay() + 6) % 7; // 0=Pazartesi
    d.setDate(d.getDate() - dow);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === 'monthly') {
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }
  return null;
}

/**
 * GET /v1/leaderboard?period=weekly|monthly|all
 *
 * Sıralama:
 *   - weekly/monthly: xp_transactions toplam (period başından şimdiye)
 *   - all: users.total_xp
 */
leaderboardRouter.get('/leaderboard', requireAuth, async (req, res, next) => {
  try {
    if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
    const q = listQuery.parse(req.query);
    const periodStart = getPeriodStart(q.period);
    const db = getDb();

    let rows: Array<{
      user_id: string;
      full_name: string | null;
      avatar_url: string | null;
      department: string | null;
      level: number;
      total_xp: number;
      period_xp: number;
    }>;

    if (q.period === 'all') {
      const data = await db
        .select({
          user_id: users.id,
          full_name: users.full_name,
          avatar_url: users.avatar_url,
          department: users.department,
          level: users.level,
          total_xp: users.total_xp,
        })
        .from(users)
        .where(and(eq(users.org_id, req.authOrgId), eq(users.is_active, true)))
        .orderBy(desc(users.total_xp))
        .limit(q.limit);
      rows = data.map((u) => ({ ...u, period_xp: u.total_xp }));
    } else {
      const data = await db
        .select({
          user_id: xpTransactions.user_id,
          full_name: users.full_name,
          avatar_url: users.avatar_url,
          department: users.department,
          level: users.level,
          total_xp: users.total_xp,
          period_xp: sql<number>`coalesce(sum(${xpTransactions.amount}), 0)::int`,
        })
        .from(xpTransactions)
        .innerJoin(users, eq(users.id, xpTransactions.user_id))
        .where(
          and(
            eq(xpTransactions.org_id, req.authOrgId),
            eq(users.is_active, true),
            gte(xpTransactions.created_at, periodStart!),
          ),
        )
        .groupBy(
          xpTransactions.user_id,
          users.full_name,
          users.avatar_url,
          users.department,
          users.level,
          users.total_xp,
        )
        .orderBy(sql`coalesce(sum(${xpTransactions.amount}), 0) desc`)
        .limit(q.limit);
      rows = data;
    }

    // Mevcut kullanıcının sırasını ayrıca dön
    let me_rank: number | null = null;
    let me_xp: number | null = null;
    if (req.authUserId) {
      const idx = rows.findIndex((r) => r.user_id === req.authUserId);
      if (idx >= 0) {
        me_rank = idx + 1;
        me_xp = rows[idx]!.period_xp;
      }
    }

    res.json({
      period: q.period,
      period_start: periodStart?.toISOString() ?? null,
      items: rows.map((r, i) => ({ ...r, rank: i + 1 })),
      me_rank,
      me_xp,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/admin/leaderboard/finalize
 * Body: { period: 'weekly' | 'monthly' }
 *
 * O dönemin ilk 3'üne bonus XP ödülü verir:
 *   1. → 500 / 2000
 *   2. → 300 / 1000
 *   3. → 100 / 500
 *
 * Aynı dönem için tekrar çağırırsa duplicate ödül vermemek için aynı periyot+rank
 * kombinasyonu için bonus var mı kontrol eder.
 */
const finalizeSchema = z.object({
  period: z.enum(['weekly', 'monthly']),
});

leaderboardRouter.post(
  '/admin/leaderboard/finalize',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const body = finalizeSchema.parse(req.body);
      const periodStart = getPeriodStart(body.period);
      if (!periodStart) throw new HttpError(400, 'Geçersiz periyot');
      const db = getDb();

      // Bu dönem için zaten ödül verildi mi?
      const existSource = body.period === 'weekly' ? 'top3_weekly' : 'top3_monthly';
      const [exist] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(xpTransactions)
        .where(
          and(
            eq(xpTransactions.org_id, req.authOrgId),
            eq(xpTransactions.source, existSource),
            gte(xpTransactions.created_at, periodStart),
          ),
        );
      if ((exist?.count ?? 0) > 0) {
        throw new HttpError(
          400,
          'Bu dönem için ilk 3 ödülü zaten verildi.',
          'ALREADY_FINALIZED',
        );
      }

      // İlk 3'ü bul
      const top3 = await db
        .select({
          user_id: xpTransactions.user_id,
          period_xp: sql<number>`coalesce(sum(${xpTransactions.amount}), 0)::int`,
        })
        .from(xpTransactions)
        .where(
          and(
            eq(xpTransactions.org_id, req.authOrgId),
            gte(xpTransactions.created_at, periodStart),
          ),
        )
        .groupBy(xpTransactions.user_id)
        .orderBy(sql`coalesce(sum(${xpTransactions.amount}), 0) desc`)
        .limit(3);

      const bonuses =
        body.period === 'weekly' ? [500, 300, 100] : [2000, 1000, 500];

      const awarded: Array<{ user_id: string; rank: number; bonus: number }> = [];
      for (let i = 0; i < top3.length && i < 3; i++) {
        const t = top3[i]!;
        const bonus = bonuses[i]!;
        await awardXp({
          orgId: req.authOrgId,
          userId: t.user_id,
          source: existSource,
          amount: bonus,
          description: `${body.period === 'weekly' ? 'Haftalık' : 'Aylık'} ilk 3 ödülü (sıra ${i + 1})`,
          metadata: { rank: i + 1, period_xp: t.period_xp },
        });
        awarded.push({ user_id: t.user_id, rank: i + 1, bonus });
      }

      logger.info(
        { orgId: req.authOrgId, by: req.authUserId, period: body.period, awarded },
        'Leaderboard finalize: ilk 3 ödülü verildi',
      );

      res.json({ ok: true, period: body.period, awarded });
    } catch (err) {
      next(err);
    }
  },
);

/** GET /v1/me/xp-history — kullanıcının kendi XP transaction geçmişi */
leaderboardRouter.get('/me/xp-history', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUserId) throw new HttpError(401, 'Yetki yok');
    const rows = await getDb()
      .select()
      .from(xpTransactions)
      .where(eq(xpTransactions.user_id, req.authUserId))
      .orderBy(desc(xpTransactions.created_at))
      .limit(100);
    res.json({ items: rows });
  } catch (err) {
    next(err);
  }
});
