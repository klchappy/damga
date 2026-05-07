import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { createWebhookSchema } from '@damga/shared';
import { generateWebhookSecret } from '@damga/verification';
import { getDb, webhooks, webhookDeliveries } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';
import { dispatchWebhook } from '../modules/webhook-delivery';

export const webhooksRouter = Router();

webhooksRouter.get(
  '/webhooks',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const rows = await getDb()
        .select()
        .from(webhooks)
        .where(eq(webhooks.org_id, req.authOrgId))
        .orderBy(desc(webhooks.created_at));
      // secret'ı asla dönme
      const safe = rows.map(({ secret: _s, ...rest }) => rest);
      res.json({ items: safe });
    } catch (err) {
      next(err);
    }
  },
);

webhooksRouter.post(
  '/webhooks',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const input = createWebhookSchema.parse(req.body);
      const secret = generateWebhookSecret();
      const [w] = await getDb()
        .insert(webhooks)
        .values({
          org_id: req.authOrgId,
          url: input.url,
          events: input.events as unknown as string[],
          secret,
        })
        .returning();
      res.status(201).json({
        webhook: { ...w, secret: undefined },
        secret,
        warning: 'Secret bir daha gösterilmeyecek. Şimdi kopyala.',
      });
    } catch (err) {
      next(err);
    }
  },
);

webhooksRouter.delete(
  '/webhooks/:id',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const [w] = await getDb()
        .delete(webhooks)
        .where(and(eq(webhooks.id, id), eq(webhooks.org_id, req.authOrgId)))
        .returning();
      if (!w) throw new HttpError(404, "Bulunamadı");
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

webhooksRouter.get(
  '/webhooks/:id/deliveries',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      // Webhook bu org'a mı?
      const [w] = await getDb()
        .select({ id: webhooks.id })
        .from(webhooks)
        .where(and(eq(webhooks.id, id), eq(webhooks.org_id, req.authOrgId)));
      if (!w) throw new HttpError(404, "Bulunamadı");
      const rows = await getDb()
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.webhook_id, id))
        .orderBy(desc(webhookDeliveries.created_at))
        .limit(100);
      res.json({ items: rows });
    } catch (err) {
      next(err);
    }
  },
);

webhooksRouter.post(
  '/webhooks/:id/test',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const [w] = await getDb()
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.id, id), eq(webhooks.org_id, req.authOrgId)));
      if (!w) throw new HttpError(404, "Bulunamadı");
      void dispatchWebhook({
        orgId: req.authOrgId,
        eventType: 'test.ping',
        payload: { message: 'Damga webhook test', from: 'api' },
      });
      res.json({ ok: true, dispatched: true });
    } catch (err) {
      next(err);
    }
  },
);
