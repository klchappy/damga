/**
 * Browser Notifications küçük helper'ı.
 *
 * Damga'nın damga-sonrası ruh hali hatırlatması için kullanır:
 *   - Kullanıcı izin verdiyse → notification gönderir; tıklayınca app açılır
 *   - Vermediyse → in-app toast / modal fallback'i
 */

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

interface SendOpts {
  title: string;
  body?: string;
  tag?: string;
  /** Tıklanınca açılacak URL (relative ok) */
  url?: string;
  /** ms — verirse bu süre sonra otomatik kapanır */
  autoClose?: number;
}

/**
 * Browser notification gönderir; izin yoksa null döner.
 * Sayfa odakta değilse görünür; odaktaysa bazı browserlar göstermez —
 * çağıran taraf in-app fallback yapmalı.
 */
export function sendBrowserNotification(opts: SendOpts): Notification | null {
  if (!isNotificationSupported()) return null;
  if (Notification.permission !== 'granted') return null;
  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
    });
    if (opts.url) {
      n.onclick = () => {
        window.focus();
        if (opts.url) window.location.href = opts.url;
        n.close();
      };
    }
    if (opts.autoClose) {
      window.setTimeout(() => n.close(), opts.autoClose);
    }
    return n;
  } catch {
    return null;
  }
}

const DISMISS_KEY = 'damga-notif-permission-dismissed';

export function isPermissionPromptDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPermissionPromptDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* noop */
  }
}
