/**
 * Feature flag endpoints.
 *
 *   GET  /v1/feature-flags/me            — kullanıcının gördüğü flag'ler (frontend için)
 *   GET  /v1/admin/feature-flags         — admin: tüm flag'ler (platform admin only)
 *   PATCH /v1/admin/feature-flags/:key   — admin: enabled/rules güncelle
 */
import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, featureFlags } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth } from '../middleware/auth';
import { clearFlagCache, isFeatureEnabled } from '../lib/feature-flags';
import { logger } from '../config/logger';

export const featureFlagsRouter = Router();

const KNOWN_KEYS = [
  'new_dashboard',
  'sms_2fa',
  'beta_bordro_excel',
  'video_kvkk_consent',
  'ai_anomaly_detection',
] as const;

/**
 * Kullanıcının context'iyle çözülmüş tüm flag'ler.
 * Frontend bunu cache'leyip useFeatureFlag() ile sorgular.
 */
featureFlagsRouter.get('/feature-flags/me', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUserId) throw new HttpError(401, 'Yetki yok');
    const orgId = req.authOrgId ?? null;
    const plan: string | null = null; // TODO: plan'ı user/org join'den çek

    const result: Record<string, boolean> = {};
    for (const key of KNOWN_KEYS) {
      result[key] = await isFeatureEnabled(key, {
        userId: req.authUserId,
        orgId,
        plan,
      });
    }
    // Cache header — frontend 60sn için cache'leyebilir
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.json({ flags: result });
  } catch (err) {
    next(err);
  }
});

/**
 * Admin: tüm flag'leri listele (platform admin only).
 * Şu an basit role check; ileride requirePlatformAdmin middleware'i ile.
 */
featureFlagsRouter.get('/admin/feature-flags', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUser || (req.authUser.role !== 'owner' && req.authUser.role !== 'admin')) {
      throw new HttpError(403, 'Sadece admin/owner erişebilir', 'FORBIDDEN');
    }
    const rows = await getDb().select().from(featureFlags).orderBy(asc(featureFlags.key));
    res.json({ flags: rows });
  } catch (err) {
    next(err);
  }
});

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  rules: z
    .object({
      orgs: z.array(z.string().uuid()).optional(),
      plans: z.array(z.string()).optional(),
      users: z.array(z.string().uuid()).optional(),
      percentage: z.number().int().min(0).max(100).optional(),
    })
    .optional(),
  description: z.string().max(500).optional(),
});

featureFlagsRouter.patch(
  '/admin/feature-flags/:key',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!req.authUser || (req.authUser.role !== 'owner' && req.authUser.role !== 'admin')) {
        throw new HttpError(403, 'Sadece admin/owner', 'FORBIDDEN');
      }
      const key = req.params.key as string | undefined;
      if (!key) throw new HttpError(400, 'key gerekli');
      const body = patchSchema.parse(req.body);

      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (body.enabled !== undefined) updates.enabled = body.enabled;
      if (body.rules !== undefined) updates.rules = body.rules;
      if (body.description !== undefined) updates.description = body.description;

      const [updated] = await getDb()
        .update(featureFlags)
        .set(updates)
        .where(eq(featureFlags.key, key))
        .returning();
      if (!updated) throw new HttpError(404, 'Flag bulunamadı', 'FLAG_NOT_FOUND');

      // Cache invalidate
      clearFlagCache();

      logger.info(
        { key, by: req.authUserId, updates: Object.keys(updates) },
        '🚩 Feature flag güncellendi',
      );
      res.json({ flag: updated });
    } catch (err) {
      next(err);
    }
  },
);
