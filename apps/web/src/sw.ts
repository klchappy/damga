/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Precache (vite-plugin-pwa injectManifest tarafından doldurulur)
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
}

/** Push gelince notification göster */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    payload = { title: 'Damga', body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon ?? '/favicon.svg',
      badge: '/favicon.svg',
      tag: payload.tag ?? 'damga-notif',
      data: { url: payload.url ?? '/' },
    } as NotificationOptions),
  );
});

/** Notification tıklanınca app'i aç ve URL'e git */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const c of all) {
        if ('focus' in c && c.url.includes(self.location.origin)) {
          await (c as WindowClient).focus();
          if ('navigate' in c) {
            await (c as WindowClient).navigate(url).catch(() => null);
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
