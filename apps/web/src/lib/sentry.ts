/**
 * Sentry error tracking — frontend.
 *
 * VITE_SENTRY_DSN env'da set değilse init skip (sessizce).
 * Production build'de DSN set olursa tüm unhandled error'lar + React render
 * hataları Sentry'ye gider (ErrorBoundary üzerinden).
 */
import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const mode = import.meta.env.MODE;
const isProd = import.meta.env.PROD;

let initialized = false;

export function initSentry(): boolean {
  if (initialized) return true;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: mode,
    release: 'damga-web@0.1.0',
    tracesSampleRate: isProd ? 0.1 : 1.0,
    replaysSessionSampleRate: 0, // session replay opsiyonel, şimdilik kapalı
    replaysOnErrorSampleRate: isProd ? 0.1 : 0,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    // KVKK: PII gönderme
    sendDefaultPii: false,
    beforeSend(event) {
      // Auth token vb. URL'lerden temizle
      if (event.request?.url) {
        event.request.url = event.request.url.replace(/access_token=[^&]+/, 'access_token=***');
      }
      return event;
    },
  });

  initialized = true;
  return true;
}

export { Sentry };
