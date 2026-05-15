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
    void deliverWebhook(w.id, w.url, w.secret, args.eventType, args.payload).catch((e) =>
      logger.warn({ e, webhookId: w.id }, 'webhook delivery error'),
    );
  }
}

export async function deliverWebhook(
  webhookId: string,
  url: string,
  secret: string,
  eventType: string,
  payload: unknown,
  attempt = 1,
): Promise<void> {
  const db = getDb();
  const tsSeconds = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    event: eventType,
    payload,
    timestamp: new Date(tsSeconds * 1000).toISOString(),
  });
  // Eski format (geri uyumluluk): body imzasi
  const sigBodyOnly = hmacSha256(secret, body);
  // Yeni format (Stripe pattern): timestamp.body imzasi (replay protection)
  const sigV2 = hmacSha256(secret, `${tsSeconds}.${body}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Damga-Signature': `sha256=${sigBodyOnly}`, // legacy format
        'X-Damga-Signature-V2': `t=${tsSeconds},v1=${sigV2}`, // recommended (replay-safe)
        'X-Damga-Timestamp': String(tsSeconds),
        'X-Damga-Event': eventType,
        'X-Damga-Webhook-Id': webhookId,
        'X-Damga-Delivery-Attempt': String(attempt),
        'User-Agent': 'damga-webhook/0.2',
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
        void deliverWebhook(webhookId, url, secret, eventType, payload, attempt + 1).catch(
          (e) => logger.warn({ e, webhookId }, 'retry failed'),
        );
      }, delay);
    } else if (!res.ok) {
      // Final fail — failure_count++ + last error metadata
      const [current] = await db
        .select({ c: webhooks.failure_count })
        .from(webhooks)
        .where(eq(webhooks.id, webhookId));
      const newFailCount = (current?.c ?? 0) + 1;
      // FIX (K3 — production audit): 10 ardışık fail sonrası webhook'u devre dışı
      // bırak. Aksi takdirde "ölü endpoint" sürekli retry tüketir + sahibine de
      // bilgilendirme yapılmadan silent shut-off oluyordu.
      const shouldDisable = newFailCount >= 10;
      await db
        .update(webhooks)
        .set({
          failure_count: newFailCount,
          last_failure_at: new Date(),
          last_failure_reason: `${res.status}: ${respText.slice(0, 200)}`,
          ...(shouldDisable ? { is_active: false } : {}),
        })
        .where(eq(webhooks.id, webhookId));
      if (shouldDisable) {
        logger.warn(
          { webhookId, url, failureCount: newFailCount },
          'Webhook 10 ardışık fail sonrası auto-disable edildi',
        );
      }
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
        void deliverWebhook(webhookId, url, secret, eventType, payload, attempt + 1).catch(
          (e) => logger.warn({ e, webhookId }, 'retry failed'),
        );
      }, delay);
    }
  }
}
