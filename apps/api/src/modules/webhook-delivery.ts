import { eq } from 'drizzle-orm';
import { hmacSha256 } from '@damga/verification';
import { getDb, webhooks, webhookDeliveries } from '@damga/db';
import { logger } from '../config/logger';

/**
 * Webhook delivery — fire-and-forget.
 * Hata durumunda exponential backoff retry (basit MVP: 3 deneme).
 */
export async function dispatchWebhook(args: {
  orgId: string;
  eventType: string;
  payload: unknown;
}) {
  const db = getDb();
  const subs = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.org_id, args.orgId));

  const matching = subs.filter(
    (s) => s.is_active && s.events.includes(args.eventType),
  );

  for (const w of matching) {
    void deliver(w.id, w.url, w.secret, args.eventType, args.payload).catch((e) =>
      logger.warn({ e, webhookId: w.id }, 'webhook delivery error'),
    );
  }
}

async function deliver(
  webhookId: string,
  url: string,
  secret: string,
  eventType: string,
  payload: unknown,
  attempt = 1,
): Promise<void> {
  const db = getDb();
  const body = JSON.stringify({
    event: eventType,
    payload,
    timestamp: new Date().toISOString(),
  });
  const signature = hmacSha256(secret, body);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Damga-Signature': `sha256=${signature}`,
        'X-Damga-Event': eventType,
        'User-Agent': 'damga-webhook/0.1',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    const respText = await res.text().catch(() => '');
    await db.insert(webhookDeliveries).values({
      webhook_id: webhookId,
      event_type: eventType,
      payload: payload as object,
      response_status: res.status,
      response_body: respText.slice(0, 2000),
      attempts: attempt,
      delivered_at: res.ok ? new Date() : null,
      failed_at: res.ok ? null : new Date(),
    });

    if (!res.ok && attempt < 3) {
      // Exponential backoff: 5sn, 30sn
      const delay = attempt * attempt * 5_000;
      setTimeout(() => {
        void deliver(webhookId, url, secret, eventType, payload, attempt + 1).catch(
          (e) => logger.warn({ e, webhookId }, 'retry failed'),
        );
      }, delay);
    } else if (!res.ok) {
      // Final fail — failure_count++ + last error metadata
      const [current] = await db
        .select({ c: webhooks.failure_count })
        .from(webhooks)
        .where(eq(webhooks.id, webhookId));
      await db
        .update(webhooks)
        .set({
          failure_count: (current?.c ?? 0) + 1,
          last_failure_at: new Date(),
          last_failure_reason: `${res.status}: ${respText.slice(0, 200)}`,
        })
        .where(eq(webhooks.id, webhookId));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    await db.insert(webhookDeliveries).values({
      webhook_id: webhookId,
      event_type: eventType,
      payload: payload as object,
      attempts: attempt,
      failed_at: new Date(),
      response_body: msg.slice(0, 2000),
    });
    if (attempt < 3) {
      const delay = attempt * attempt * 5_000;
      setTimeout(() => {
        void deliver(webhookId, url, secret, eventType, payload, attempt + 1).catch(
          (e) => logger.warn({ e, webhookId }, 'retry failed'),
        );
      }, delay);
    }
  }
}
