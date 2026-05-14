/**
 * Sentry error tracking — backend.
 *
 * SENTRY_DSN env'da set değilse init skip (sessizce, hata yok).
 * Production'da DSN set olursa tüm unhandled error'lar Sentry'ye gider.
 *
 * Express integration: `Sentry.setupExpressErrorHandler(app)` ile entegre
 * (apps/api/src/index.ts'te errorHandler'dan ÖNCE çağrılır).
 *
 * NOT: Sentry.init en başta — diğer import'ları monkey-patch eder
 * (http, fetch, db query'leri trace edebilmek için).
 */
import * as Sentry from '@sentry/node';
import { env } from '../config/env';

let initialized = false;

export function initSentry(): boolean {
  if (initialized) return true;
  if (!env.SENTRY_DSN) return false;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: `damga-api@${process.env.npm_package_version ?? '0.1.0'}`,
    // Trace sampling: production'da %10, dev'de %100 (env'den)
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
    ],
    // PII (kişisel veri) gönderme — KVKK uyumu
    sendDefaultPii: false,
    beforeSend(event) {
      // Sensitive header'ları filtrele
      if (event.request?.headers) {
        const headers = event.request.headers as Record<string, string>;
        delete headers['authorization'];
        delete headers['cookie'];
        delete headers['x-api-key'];
      }
      return event;
    },
  });

  initialized = true;
  return true;
}

export { Sentry };
