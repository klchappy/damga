import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { eq, and, desc, count } from 'drizzle-orm';
import { z } from 'zod';
import { API_SCOPES, createApiKeySchema } from '@damga/shared';
import { generateApiKey } from '@damga/verification';
import { getDb, apiKeys, orgs } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requirePlatformAdminUser, requireRole } from '../middleware/auth';
import { getPlanLimit } from '../lib/plan-limits';

export const apiKeysRouter = Router();

const updateApiKeySchema = z.object({
  name: z.string().min(2).max(80).optional(),
  scopes: z.array(z.enum(API_SCOPES)).min(1).optional(),
  rate_limit_per_min: z.number().int().min(1).max(10_000).optional(),
  is_active: z.boolean().optional(),
  expires_at: z.string().datetime().nullable().optional(),
});

apiKeysRouter.get(
  '/api-keys',
  requireAuth,
  requireRole('admin', 'owner'),
  requirePlatformAdminUser,
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const rows = await getDb()
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          key_prefix: apiKeys.key_prefix,
          scopes: apiKeys.scopes,
          rate_limit_per_min: apiKeys.rate_limit_per_min,
          last_used_at: apiKeys.last_used_at,
          expires_at: apiKeys.expires_at,
          is_active: apiKeys.is_active,
          created_at: apiKeys.created_at,
        })
        .from(apiKeys)
        .where(eq(apiKeys.org_id, req.authOrgId))
        .orderBy(desc(apiKeys.created_at));
      res.json({ items: rows });
    } catch (err) {
      next(err);
    }
  },
);

apiKeysRouter.post(
  '/api-keys',
  requireAuth,
  requireRole('admin', 'owner'),
  requirePlatformAdminUser,
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
      const input = createApiKeySchema.parse(req.body);
      const db = getDb();
      const [orgPlan] = await db
        .select({ plan: orgs.plan })
        .from(orgs)
        .where(eq(orgs.id, req.authOrgId));
      const plan = orgPlan?.plan ?? 'free';
      const [usage] = await db
        .select({ total: count() })
        .from(apiKeys)
        .where(and(eq(apiKeys.org_id, req.authOrgId), eq(apiKeys.is_active, true)));
      const keyLimit = await getPlanLimit(plan, 'api_keys');
      if (Number.isFinite(keyLimit) && (usage?.total ?? 0) >= keyLimit) {
        throw new HttpError(
          402,
          `Bu plan en fazla ${keyLimit} aktif API key'e izin verir. Plan yukseltmesi gerekir.`,
          'PLAN_LIMIT_API_KEYS',
        );
      }
      const { raw, prefix } = generateApiKey();
      const hash = await bcrypt.hash(raw, 12);
      const [k] = await db
        .insert(apiKeys)
        .values({
          org_id: req.authOrgId,
          key_type: 'org_admin',
          name: input.name,
          key_hash: hash,
          key_prefix: prefix,
          scopes: input.scopes as unknown as string[],
          rate_limit_per_min: input.rate_limit_per_min,
          expires_at: input.expires_at ? new Date(input.expires_at) : null,
          created_by: req.authUserId,
        })
        .returning();

      // Raw key yalnızca BU yanıtta dönülür — bir daha asla
      res.status(201).json({
        api_key: {
          id: k!.id,
          name: k!.name,
          key_prefix: k!.key_prefix,
          scopes: k!.scopes,
          created_at: k!.created_at,
        },
        secret_key: raw,
        warning: 'Bu key bir daha gösterilmeyecek. Şimdi kopyala ve güvenli sakla.',
      });
    } catch (err) {
      next(err);
    }
  },
);

apiKeysRouter.delete(
  '/api-keys/:id',
  requireAuth,
  requireRole('admin', 'owner'),
  requirePlatformAdminUser,
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const [k] = await getDb()
        .delete(apiKeys)
        .where(and(eq(apiKeys.id, id), eq(apiKeys.org_id, req.authOrgId)))
        .returning();
      if (!k) throw new HttpError(404, 'API key bulunamadı');
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

apiKeysRouter.patch(
  '/api-keys/:id',
  requireAuth,
  requireRole('admin', 'owner'),
  requirePlatformAdminUser,
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const input = updateApiKeySchema.parse(req.body);
      const patch: {
        name?: string;
        scopes?: string[];
        rate_limit_per_min?: number;
        is_active?: boolean;
        expires_at?: Date | null;
      } = {};

      if (input.name !== undefined) patch.name = input.name;
      if (input.scopes !== undefined) patch.scopes = input.scopes as unknown as string[];
      if (input.rate_limit_per_min !== undefined) {
        patch.rate_limit_per_min = input.rate_limit_per_min;
      }
      if (input.is_active !== undefined) patch.is_active = input.is_active;
      if (input.expires_at !== undefined) {
        patch.expires_at = input.expires_at ? new Date(input.expires_at) : null;
      }

      const [k] = await getDb()
        .update(apiKeys)
        .set(patch)
        .where(and(eq(apiKeys.id, id), eq(apiKeys.org_id, req.authOrgId)))
        .returning({
          id: apiKeys.id,
          name: apiKeys.name,
          key_prefix: apiKeys.key_prefix,
          scopes: apiKeys.scopes,
          rate_limit_per_min: apiKeys.rate_limit_per_min,
          last_used_at: apiKeys.last_used_at,
          expires_at: apiKeys.expires_at,
          is_active: apiKeys.is_active,
          created_at: apiKeys.created_at,
        });

      if (!k) throw new HttpError(404, 'API key bulunamadi');
      res.json({ api_key: k });
    } catch (err) {
      next(err);
    }
  },
);
