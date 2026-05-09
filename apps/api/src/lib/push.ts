/**
 * Web Push API helper — VAPID ile browser push notification gönderimi.
 *
 * createNotification içinden async olarak çağrılır; başarısız olursa
 * (subscription expired, gone) row pasifleştirilir.
 */

import webpush from 'web-push';
import { and, eq } from 'drizzle-orm';
import { getDb, pushSubscriptions } from '@damga/db';
import { env, isConfigured } from '../config/env';
import { logger } from './../config/logger';

let _initialized = false;
function ensureInit() {
  if (_initialized) return;
  if (!isConfigured.webPush) return;
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY!,
    env.VAPID_PRIVATE_KEY!,
  );
  _initialized = true;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
}

/**
 * Bir kullanıcının tüm aktif push subscription'larına gönderir.
 * Her subscription bağımsız; bir tanesi düşse de diğerleri çalışır.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number; deactivated: number }> {
  if (!isConfigured.webPush) return { sent: 0, failed: 0, deactivated: 0 };
  ensureInit();

  const db = getDb();
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.user_id, userId), eq(pushSubscriptions.is_active, true)),
    );

  if (subs.length === 0) return { sent: 0, failed: 0, deactivated: 0 };

  let sent = 0;
  let failed = 0;
  let deactivated = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify({
            title: payload.title,
            body: payload.body ?? '',
            url: payload.url ?? '/',
            tag: payload.tag ?? 'damga-notif',
            icon: payload.icon ?? '/favicon.svg',
          }),
        );
        sent++;
        await db
          .update(pushSubscriptions)
          .set({ last_used_at: new Date() })
          .where(eq(pushSubscriptions.id, s.id));
      } catch (e) {
        failed++;
        const status = (e as { statusCode?: number }).statusCode;
        // 404/410: subscription expired veya unsubscribed
        if (status === 404 || status === 410) {
          await db
            .update(pushSubscriptions)
            .set({ is_active: false })
            .where(eq(pushSubscriptions.id, s.id));
          deactivated++;
        } else {
          logger.warn(
            { userId, subId: s.id, err: e, status },
            'Web push failed',
          );
        }
      }
    }),
  );

  return { sent, failed, deactivated };
}
