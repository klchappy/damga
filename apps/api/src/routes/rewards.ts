import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  getDb,
  rewards,
  userRedemptions,
  users,
  xpTransactions,
} from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';
import { awardXp } from '../lib/xp';
import { logger } from '../config/logger';

export const rewardsRouter = Router();

/** Liste — herkes görebilir (sadece kendi org'unun aktif ödülleri) */
rewardsRouter.get('/rewards', requireAuth, async (req, res, next) => {
  try {
    if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
    const includeInactive = req.query.all === '1';
    const conditions = [eq(rewards.org_id, req.authOrgId)];
    if (!includeInactive) conditions.push(eq(rewards.is_active, true));
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

      res.json({ ok: true, status: body.status });
    } catch (err) {
      next(err);
    }
  },
);
