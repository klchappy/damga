import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  getDb,
  rewards,
  userRedemptions,
  users,
  xpTransactions,
  monthlyMarketCredits,
} from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';
import { awardXp } from '../lib/xp';
import { createNotification } from '../lib/notifications';
import { logger } from '../config/logger';

export const rewardsRouter = Router();

/**
 * GET /v1/rewards — herkes görebilir (sadece kendi org'unun aktif ödülleri)
 * ?market_type=standard|monthly_top3|all (default: standard)
 * ?all=1 → admin için pasifleri de göster
 */
rewardsRouter.get('/rewards', requireAuth, async (req, res, next) => {
  try {
    if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
    const includeInactive = req.query.all === '1';
    const marketType =
      (req.query.market_type as string | undefined) ?? 'standard';
    const conditions = [eq(rewards.org_id, req.authOrgId)];
    if (!includeInactive) conditions.push(eq(rewards.is_active, true));
    if (marketType === 'standard' || marketType === 'monthly_top3') {
      conditions.push(eq(rewards.market_type, marketType));
    }
    const items = await getDb()
      .select()
      .from(rewards)
      .where(and(...conditions))
      .orderBy(rewards.cost_xp);
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

/** Yeni ödül ekle (admin/owner) */
const createRewardSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  icon: z.string().min(1).max(8).default('🎁'),
  cost_xp: z.number().int().positive().max(100_000),
  stock: z.number().int().nonnegative().nullable().optional(),
  per_user_limit: z.number().int().positive().nullable().optional(),
  market_type: z.enum(['standard', 'monthly_top3']).default('standard'),
});

rewardsRouter.post(
  '/rewards',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
      const input = createRewardSchema.parse(req.body);
      const [r] = await getDb()
        .insert(rewards)
        .values({
          org_id: req.authOrgId,
          name: input.name,
          description: input.description ?? null,
          icon: input.icon,
          cost_xp: input.cost_xp,
          stock: input.stock ?? null,
          per_user_limit: input.per_user_limit ?? null,
          market_type: input.market_type,
          created_by: req.authUserId,
        })
        .returning();
      res.status(201).json({ reward: r });
    } catch (err) {
      next(err);
    }
  },
);

/** Düzenle (admin/owner) */
const updateRewardSchema = createRewardSchema.partial().extend({
  is_active: z.boolean().optional(),
});

rewardsRouter.patch(
  '/rewards/:id',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const input = updateRewardSchema.parse(req.body);
      const updates: Record<string, unknown> = { updated_at: new Date() };
      for (const k of [
        'name',
        'description',
        'icon',
        'cost_xp',
        'stock',
        'per_user_limit',
        'is_active',
        'market_type',
      ] as const) {
        if (input[k] !== undefined) updates[k] = input[k];
      }
      const [r] = await getDb()
        .update(rewards)
        .set(updates)
        .where(and(eq(rewards.id, id), eq(rewards.org_id, req.authOrgId)))
        .returning();
      if (!r) throw new HttpError(404, 'Ödül bulunamadı');
      res.json({ reward: r });
    } catch (err) {
      next(err);
    }
  },
);

/** Sil (soft: is_active=false) */
rewardsRouter.delete(
  '/rewards/:id',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      await getDb()
        .update(rewards)
        .set({ is_active: false, updated_at: new Date() })
        .where(and(eq(rewards.id, id), eq(rewards.org_id, req.authOrgId)));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/rewards/:id/redeem — kullanıcı ödülü satın alır.
 *
 * Atomik (mümkün olduğunca):
 *  1) Ödül var, aktif, stok yeter
 *  2) Kullanıcının XP'si yeter
 *  3) per_user_limit aşılmamış
 *  4) xp_transactions'a negatif kayıt + total_xp güncelle
 *  5) user_redemptions kaydı oluştur (status: pending — admin teslim ettikten sonra fulfilled)
 */
rewardsRouter.post('/rewards/:id/redeem', requireAuth, async (req, res, next) => {
  try {
    if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
    const id = String(req.params.id ?? '').trim();
    const db = getDb();

    const [reward] = await db
      .select()
      .from(rewards)
      .where(and(eq(rewards.id, id), eq(rewards.org_id, req.authOrgId)));
    if (!reward) throw new HttpError(404, 'Ödül bulunamadı');
    if (!reward.is_active) throw new HttpError(400, 'Ödül aktif değil', 'INACTIVE');

    // Stok kontrol
    if (reward.stock !== null) {
      const [used] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(userRedemptions)
        .where(
          and(
            eq(userRedemptions.reward_id, id),
            sql`${userRedemptions.status} <> 'cancelled'`,
          ),
        );
      if ((used?.c ?? 0) >= reward.stock) {
        throw new HttpError(400, 'Ödül stoğu tükendi', 'OUT_OF_STOCK');
      }
    }

    // Per-user limit
    if (reward.per_user_limit !== null) {
      const [used] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(userRedemptions)
        .where(
          and(
            eq(userRedemptions.reward_id, id),
            eq(userRedemptions.user_id, req.authUserId),
            sql`${userRedemptions.status} <> 'cancelled'`,
          ),
        );
      if ((used?.c ?? 0) >= reward.per_user_limit) {
        throw new HttpError(
          400,
          'Bu ödülü daha önce kullandın, limitini aştın.',
          'PER_USER_LIMIT',
        );
      }
    }

    // Kullanıcının XP'si yeter mi?
    const [u] = await db
      .select({ total_xp: users.total_xp, full_name: users.full_name })
      .from(users)
      .where(eq(users.id, req.authUserId));
    if (!u) throw new HttpError(404, 'Kullanıcı bulunamadı');
    if (u.total_xp < reward.cost_xp) {
      throw new HttpError(
        400,
        `Yetersiz XP — bu ödül için ${reward.cost_xp} XP gerekli, sende ${u.total_xp} XP var.`,
        'INSUFFICIENT_XP',
      );
    }

    // Negatif XP kaydı + total_xp düş
    const xp = await awardXp({
      orgId: req.authOrgId,
      userId: req.authUserId,
      source: 'redeem',
      amount: -reward.cost_xp,
      description: `Ödül satın alındı: ${reward.name}`,
      refId: reward.id,
      refType: 'reward',
    });

    // Redemption kaydı
    const [redemption] = await db
      .insert(userRedemptions)
      .values({
        org_id: req.authOrgId,
        user_id: req.authUserId,
        reward_id: reward.id,
        cost_xp: reward.cost_xp,
        status: 'pending',
        xp_transaction_id: xp.transaction_id,
      })
      .returning();

    logger.info(
      { userId: req.authUserId, rewardId: reward.id, cost: reward.cost_xp },
      'Reward redeemed',
    );

    res.status(201).json({
      ok: true,
      redemption,
      reward,
      remaining_xp: xp.total_xp,
    });
  } catch (err) {
    next(err);
  }
});

/** Kullanıcının kendi redeem geçmişi */
rewardsRouter.get('/me/redemptions', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUserId) throw new HttpError(401, 'Yetki yok');
    const rows = await getDb()
      .select({
        redemption: userRedemptions,
        reward_name: rewards.name,
        reward_icon: rewards.icon,
      })
      .from(userRedemptions)
      .leftJoin(rewards, eq(rewards.id, userRedemptions.reward_id))
      .where(eq(userRedemptions.user_id, req.authUserId))
      .orderBy(desc(userRedemptions.created_at));
    res.json({
      items: rows.map((r) => ({ ...r.redemption, reward_name: r.reward_name, reward_icon: r.reward_icon })),
    });
  } catch (err) {
    next(err);
  }
});

/** Admin: bekleyen tüm redemption'lar */
rewardsRouter.get(
  '/admin/redemptions',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const rows = await getDb()
        .select({
          redemption: userRedemptions,
          reward_name: rewards.name,
          reward_icon: rewards.icon,
          user_name: users.full_name,
          user_email: users.email,
          user_phone: users.phone,
        })
        .from(userRedemptions)
        .leftJoin(rewards, eq(rewards.id, userRedemptions.reward_id))
        .leftJoin(users, eq(users.id, userRedemptions.user_id))
        .where(eq(userRedemptions.org_id, req.authOrgId))
        .orderBy(desc(userRedemptions.created_at));
      res.json({
        items: rows.map((r) => ({
          ...r.redemption,
          reward_name: r.reward_name,
          reward_icon: r.reward_icon,
          user_name: r.user_name,
          user_email: r.user_email,
          user_phone: r.user_phone,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────
// MONTHLY MARKET (top3 only)
// ─────────────────────────────────────────────────────────────────────────

/** GET /v1/me/monthly-market — kullanıcının aktif credit'i + market_type='monthly_top3' rewards */
rewardsRouter.get('/me/monthly-market', requireAuth, async (req, res, next) => {
  try {
    if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
    const db = getDb();

    const credits = await db
      .select()
      .from(monthlyMarketCredits)
      .where(
        and(
          eq(monthlyMarketCredits.user_id, req.authUserId),
          eq(monthlyMarketCredits.is_active, true),
          sql`${monthlyMarketCredits.expires_at} > now()`,
        ),
      )
      .orderBy(desc(monthlyMarketCredits.created_at));

    const totalRemaining = credits.reduce(
      (sum, c) => sum + (c.credit_amount - c.spent_amount),
      0,
    );

    // Market'te satılan ödüller
    const items = await db
      .select()
      .from(rewards)
      .where(
        and(
          eq(rewards.org_id, req.authOrgId),
          eq(rewards.is_active, true),
          eq(rewards.market_type, 'monthly_top3'),
        ),
      )
      .orderBy(rewards.cost_xp);

    res.json({
      credits,
      total_remaining: totalRemaining,
      has_access: credits.length > 0,
      items,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/monthly-market/redeem/:reward_id
 * Aylık market'ten ödül satın alır. Credit'ten düşer (XP'den değil).
 */
rewardsRouter.post(
  '/monthly-market/redeem/:reward_id',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
      const rewardId = String(req.params.reward_id ?? '').trim();
      const db = getDb();

      const [reward] = await db
        .select()
        .from(rewards)
        .where(
          and(eq(rewards.id, rewardId), eq(rewards.org_id, req.authOrgId)),
        );
      if (!reward) throw new HttpError(404, 'Ödül bulunamadı');
      if (!reward.is_active) throw new HttpError(400, 'Ödül aktif değil', 'INACTIVE');
      if (reward.market_type !== 'monthly_top3')
        throw new HttpError(400, 'Bu ödül aylık markette satılmıyor', 'WRONG_MARKET');

      // Stok kontrol
      if (reward.stock !== null) {
        const [used] = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(userRedemptions)
          .where(
            and(
              eq(userRedemptions.reward_id, rewardId),
              sql`${userRedemptions.status} <> 'cancelled'`,
            ),
          );
        if ((used?.c ?? 0) >= reward.stock)
          throw new HttpError(400, 'Stok tükendi', 'OUT_OF_STOCK');
      }

      // Per-user limit
      if (reward.per_user_limit !== null) {
        const [used] = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(userRedemptions)
          .where(
            and(
              eq(userRedemptions.reward_id, rewardId),
              eq(userRedemptions.user_id, req.authUserId),
              sql`${userRedemptions.status} <> 'cancelled'`,
            ),
          );
        if ((used?.c ?? 0) >= reward.per_user_limit)
          throw new HttpError(400, 'Limit aşıldı', 'PER_USER_LIMIT');
      }

      // Aktif credit'leri bul, FIFO sırasıyla harca
      const credits = await db
        .select()
        .from(monthlyMarketCredits)
        .where(
          and(
            eq(monthlyMarketCredits.user_id, req.authUserId),
            eq(monthlyMarketCredits.is_active, true),
            sql`${monthlyMarketCredits.expires_at} > now()`,
            sql`${monthlyMarketCredits.credit_amount} > ${monthlyMarketCredits.spent_amount}`,
          ),
        )
        .orderBy(monthlyMarketCredits.expires_at);

      const totalAvailable = credits.reduce(
        (sum, c) => sum + (c.credit_amount - c.spent_amount),
        0,
      );
      if (totalAvailable < reward.cost_xp) {
        throw new HttpError(
          400,
          `Yetersiz market kredisi — ${reward.cost_xp} gerekli, ${totalAvailable} var`,
          'INSUFFICIENT_CREDIT',
        );
      }

      // FIFO harcama (en yakın expire eden önce)
      let remaining = reward.cost_xp;
      for (const c of credits) {
        if (remaining <= 0) break;
        const available = c.credit_amount - c.spent_amount;
        const take = Math.min(available, remaining);
        await db
          .update(monthlyMarketCredits)
          .set({ spent_amount: c.spent_amount + take })
          .where(eq(monthlyMarketCredits.id, c.id));
        remaining -= take;
      }

      // Redemption kaydı (XP transaction'ı YOK — direkt credit'ten düştük)
      const [redemption] = await db
        .insert(userRedemptions)
        .values({
          org_id: req.authOrgId,
          user_id: req.authUserId,
          reward_id: reward.id,
          cost_xp: reward.cost_xp,
          status: 'pending',
        })
        .returning();

      logger.info(
        { userId: req.authUserId, rewardId, cost: reward.cost_xp },
        '🛒 Aylık market redeemed',
      );

      res.status(201).json({
        ok: true,
        redemption,
        reward,
        remaining_credit: totalAvailable - reward.cost_xp,
      });
    } catch (err) {
      next(err);
    }
  },
);

/** Admin: redemption fulfilled / cancelled işaretle */
const fulfillSchema = z.object({
  status: z.enum(['fulfilled', 'cancelled']),
  notes: z.string().max(500).optional(),
});

rewardsRouter.post(
  '/admin/redemptions/:id/fulfill',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const body = fulfillSchema.parse(req.body);
      const db = getDb();

      const [r] = await db
        .select()
        .from(userRedemptions)
        .where(and(eq(userRedemptions.id, id), eq(userRedemptions.org_id, req.authOrgId)));
      if (!r) throw new HttpError(404, 'Talep bulunamadı');
      if (r.status !== 'pending') {
        throw new HttpError(400, `Talep zaten ${r.status} durumunda`);
      }

      // Cancelled → XP'yi geri ver
      if (body.status === 'cancelled') {
        await awardXp({
          orgId: req.authOrgId,
          userId: r.user_id,
          source: 'redeem_refund',
          amount: r.cost_xp,
          description: `İptal edilen ödül iadesi`,
          refId: r.id,
          refType: 'redemption',
        });
      }

      await db
        .update(userRedemptions)
        .set({
          status: body.status,
          fulfilled_by: req.authUserId,
          fulfilled_at: new Date(),
          notes: body.notes ?? null,
        })
        .where(eq(userRedemptions.id, id));

      // Reward adı için ek query
      const [rewardRow] = await db
        .select({ name: rewards.name, icon: rewards.icon })
        .from(rewards)
        .where(eq(rewards.id, r.reward_id));

      void createNotification({
        orgId: req.authOrgId,
        userId: r.user_id,
        type:
          body.status === 'fulfilled' ? 'redemption_fulfilled' : 'redemption_cancelled',
        title:
          body.status === 'fulfilled'
            ? `${rewardRow?.icon ?? '🎁'} Ödülün teslim edildi`
            : `↩️ Ödül iptal edildi (${r.cost_xp} XP iade)`,
        body: rewardRow?.name ?? null,
        url: '/rewards',
        metadata: {
          redemption_id: r.id,
          reward_id: r.reward_id,
          status: body.status,
        },
      });

      res.json({ ok: true, status: body.status });
    } catch (err) {
      next(err);
    }
  },
);
