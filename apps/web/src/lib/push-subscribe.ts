/**
 * Web Push subscribe yardımcısı.
 *
 * Akış:
 *  1) Service worker register edildiyse al
 *  2) /v1/push/vapid-public-key'i çek
 *  3) PushManager.subscribe()
 *  4) Sunucuya kaydet (POST /v1/me/push-subscriptions)
 */

import { api } from './api';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.ready) ?? null;
  } catch {
    return null;
  }
}

export async function subscribePush(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };

  // Permission zaten denied ise sub yapamayız
  if (Notification.permission === 'denied') {
    return { ok: false, reason: 'permission_denied' };
  }
  if (Notification.permission !== 'granted') {
    const r = await Notification.requestPermission();
    if (r !== 'granted') return { ok: false, reason: 'permission_denied' };
  }

  const reg = await getServiceWorkerRegistration();
  if (!reg) return { ok: false, reason: 'no_sw' };

  // VAPID key çek
  const { data } = await api.get<{ key: string | null }>('/push/vapid-public-key');
  const vapid = data.key;
  if (!vapid) return { ok: false, reason: 'no_vapid' };

  // Mevcut sub varsa onu yeniden kullan, yoksa yeni
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const keyArr = urlBase64ToUint8Array(vapid);
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyArr.buffer.slice(
        keyArr.byteOffset,
        keyArr.byteOffset + keyArr.byteLength,
      ) as ArrayBuffer,
    });
  }

  const json = sub.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: 'bad_subscription' };
  }

  await api.post('/me/push-subscriptions', {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    user_agent: navigator.userAgent,
  });

  return { ok: true };
}

export async function unsubscribePush(): Promise<{ ok: boolean }> {
  const reg = await getServiceWorkerRegistration();
  if (!reg) return { ok: false };
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return { ok: true };
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => null);
  await api
    .delete('/me/push-subscriptions', { data: { endpoint } })
    .catch(() => null);
  return { ok: true };
}
