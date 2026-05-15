/**
 * Resend webhook handler — email teslimat olaylarını yakalar.
 *
 * Setup:
 *   1. Resend dashboard → Webhooks → Add endpoint
 *   2. URL: https://api.damga.deploi.net/v1/webhooks/resend
 *   3. Events: email.sent, email.delivered, email.bounced, email.complained,
 *      email.opened, email.clicked
 *   4. Signing secret kopyala → Coolify env: RESEND_WEBHOOK_SECRET=whsec_...
 *
 * Resend Svix-based signed webhook'lar kullanır. Header'lar:
 *   - svix-id: idempotency key
 *   - svix-timestamp: unix epoch sec
 *   - svix-signature: HMAC-SHA256(secret, svix-id.svix-timestamp.body)
 *
 * Endpoint: POST /v1/webhooks/resend (auth GEREKMEZ, signature ile doğrulanır)
 */
import { Router, type Request } from 'express';
import crypto from 'node:crypto';
import { getDb, emailEvents } from '@damga/db';
import { requireAuth, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { env } from '../config/env';
import { logger } from '../config/logger';

export const resendWebhookRouter = Router();

/**
 * Svix-style HMAC doğrulama.
 * Detay: https://docs.svix.com/receiving/verifying-payloads/how
 */
function verifySvixSignature(args: {
  secret: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  body: string;
}): boolean {
  // Secret formatı: "whsec_<base64-encoded-secret>"
  const rawSecret = args.secret.startsWith('whsec_')
    ? Buffer.from(args.secret.slice(6), 'base64')
    : Buffer.from(args.secret, 'utf8');

  const signed = `${args.svixId}.${args.svixTimestamp}.${args.body}`;
  const expected = crypto.createHmac('sha256', rawSecret).update(signed).digest('base64');

  // svix-signature header'ı multiple sig içerebilir: "v1,sig1 v1,sig2"
  const signatures = args.svixSignature.split(' ').map((s) => {
    const parts = s.split(',');
    return parts[1] ?? '';
  });

  for (const sig of signatures) {
    if (sig && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
      return true;
    }
  }
  return false;
}

resendWebhookRouter.post(
  '/webhooks/resend',
  // express.raw eklemek gerekiyor — JSON parse'a kıyasla body'nin orijinal byte'ları lazım
  async (req: Request, res) => {
    try {
      const svixId = req.headers['svix-id'] as string | undefined;
      const svixTimestamp = req.headers['svix-timestamp'] as string | undefined;
      const svixSignature = req.headers['svix-signature'] as string | undefined;

      if (!svixId || !svixTimestamp || !svixSignature) {
        return res.status(400).json({ error: 'Missing Svix headers' });
      }

      const secret = env.RESEND_WEBHOOK_SECRET;
      if (!secret) {
        logger.warn('Resend webhook geldi ama RESEND_WEBHOOK_SECRET set değil — reddedildi');
        return res.status(503).json({ error: 'Webhook secret not configured' });
      }

      // Replay attack koruması: timestamp 5 dakikadan eski olmasın
      const tsSec = parseInt(svixTimestamp, 10);
      const nowSec = Math.floor(Date.now() / 1000);
      if (Math.abs(nowSec - tsSec) > 300) {
        return res.status(400).json({ error: 'Timestamp out of range (replay protection)' });
      }

      // FIX (Y13 — production audit): RAW body kullan. apps/api/src/index.ts'te
      // bu route için express.raw middleware tanımlandı, req.body Buffer geliyor.
      // Eski versiyon JSON.stringify(req.body) yapıyordu → key sırası farklı olabilir,
      // HMAC mismatch. Şimdi byte-level identical → signature doğru.
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body.toString('utf-8')
        : typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body); // legacy fallback

      const valid = verifySvixSignature({
        secret,
        svixId,
        svixTimestamp,
        svixSignature,
        body: rawBody,
      });

      if (!valid) {
        logger.warn({ svixId }, 'Resend webhook signature mismatch');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Payload parse — JSON sadece signature doğrulandıktan sonra
      const payload = JSON.parse(rawBody) as Record<string, unknown>;

      const eventType = (payload.type as string) ?? 'unknown';
      const dataField = (payload.data ?? {}) as Record<string, unknown>;
      const occurredAt =
        typeof payload.created_at === 'string' ? new Date(payload.created_at) : null;

      // Idempotency: svix-id unique
      try {
        await getDb()
          .insert(emailEvents)
          .values({
            resend_event_id: svixId,
            event_type: eventType,
            resend_email_id: (dataField.email_id as string) ?? null,
            from_email: (dataField.from as string) ?? null,
            to_email: Array.isArray(dataField.to) ? (dataField.to as string[])[0] ?? null : (dataField.to as string) ?? null,
            subject: (dataField.subject as string) ?? null,
            bounce_type: ((dataField.bounce as Record<string, unknown>)?.type as string) ?? null,
            bounce_reason: ((dataField.bounce as Record<string, unknown>)?.message as string) ?? null,
            payload: payload as Record<string, unknown>,
            occurred_at: occurredAt,
          })
          .onConflictDoNothing();
      } catch (e) {
        logger.error({ err: e, svixId }, 'Email event insert failed');
      }

      // Critical event'ler için alarm (loglama düzeyinde)
      if (eventType === 'email.bounced' || eventType === 'email.complained') {
        logger.warn(
          {
            type: eventType,
            to: dataField.to,
            bounce_type: ((dataField.bounce as Record<string, unknown>)?.type as string) ?? undefined,
          },
          `📧 Email ${eventType === 'email.bounced' ? 'BOUNCE' : 'SPAM COMPLAINT'}`,
        );
      }

      // Resend webhook 200 OK bekler (aksi halde retry yapar)
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, 'Resend webhook handler hata');
      res.status(500).json({ error: 'Internal error' });
    }
  },
);

/**
 * GET /v1/webhooks/resend/stats — son 24 saatlik email teslimat sağlığı (org bazlı).
 *
 * Admin/owner için: bu org'a gönderilen maillerin sent/delivered/bounced/complained
 * dağılımı. Platform genelinde değil — sadece kendi org'un.
 *
 * Önceki versiyon auth'suzdu ve TÜM org'ların metriklerini döndürüyordu — bu
 * info leak idi. Şimdi requireAuth + admin/owner + org_id filter ile korunmuş.
 */
resendWebhookRouter.get(
  '/webhooks/resend/stats',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const { sql } = await import('drizzle-orm');
      const rows = await getDb().execute<{ event_type: string; count: number }>(sql`
        SELECT event_type, count(*)::int as count
        FROM public.email_events
        WHERE received_at > now() - interval '24 hours'
          AND org_id = ${req.authOrgId}
        GROUP BY event_type
        ORDER BY count DESC
      `);
      const data = (rows as unknown as { rows?: Array<{ event_type: string; count: number }> }).rows
        ?? (rows as unknown as Array<{ event_type: string; count: number }>);
      res.json({ stats: data ?? [], window: '24h' });
    } catch (err) {
      next(err);
    }
  },
);
