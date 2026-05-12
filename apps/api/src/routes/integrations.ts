import { Router } from 'express';
import { and, count, eq } from 'drizzle-orm';
import { getDb, apiKeys, webhooks } from '@damga/db';
import { requireAuth, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { env, isConfigured } from '../config/env';

export const integrationsRouter = Router();

integrationsRouter.get(
  '/integrations/status',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');

      const db = getDb();
      const [[keyStats], [webhookStats]] = await Promise.all([
        db
          .select({
            total: count(),
          })
          .from(apiKeys)
          .where(and(eq(apiKeys.org_id, req.authOrgId), eq(apiKeys.is_active, true))),
        db
          .select({
            total: count(),
          })
          .from(webhooks)
          .where(and(eq(webhooks.org_id, req.authOrgId), eq(webhooks.is_active, true))),
      ]);

      res.json({
        endpoints: {
          api_base_url: `${env.SERVER_URL.replace(/\/+$/, '')}/v1`,
          app_url: env.CLIENT_URL,
          docs_url: `${env.CLIENT_URL.replace(/\/+$/, '')}/docs`,
        },
        counts: {
          active_api_keys: keyStats?.total ?? 0,
          active_webhooks: webhookStats?.total ?? 0,
        },
        services: {
          database: isConfigured.db,
          supabase: isConfigured.supabase,
          resend: isConfigured.resend,
          redis: isConfigured.redis,
          web_push: isConfigured.webPush,
        },
        mail: {
          from: env.EMAIL_FROM,
          contact: env.CONTACT_EMAIL,
          support: env.SUPPORT_EMAIL,
          kvkk: env.KVKK_EMAIL,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);
