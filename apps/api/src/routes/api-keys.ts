import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { eq, and, desc } from 'drizzle-orm';
import { createApiKeySchema } from '@damga/shared';
import { generateApiKey } from '@damga/verification';
import { getDb, apiKeys } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';

export const apiKeysRouter = Router();

apiKeysRouter.get(
  '/api-keys',
  requireAuth,
  requireRole('admin', 'owner'),
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
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
      const input = createApiKeySchema.parse(req.body);
      const { raw, prefix } = generateApiKey();
      const hash = await bcrypt.hash(raw, 12);
      const [k] = await getDb()
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
