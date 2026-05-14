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
import { nodeProfilingIntegration } from '@sentry/profiling-node';
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
    // Profile sampling — profiled trace'lerin %50'sini detay profile çıkar
    profilesSampleRate: 0.5,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
      nodeProfilingIntegration(),
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
        delete headers['svix-signature']; // webhook signing
      }
      // Query params'ta token vs varsa
      if (event.request?.query_string) {
        const qs = event.request.query_string as string;
        if (/token=|secret=|key=/i.test(qs)) {
          event.request.query_string = '[FILTERED]';
        }
      }
      return event;
    },
    // Critical breadcrumb: tüm DB query'leri (rapor için)
    beforeBreadcrumb(breadcrumb) {
      // 1KB üstü SQL query'leri kısalt
      if (breadcrumb.category === 'query' && typeof breadcrumb.message === 'string') {
        if (breadcrumb.message.length > 1024) {
          breadcrumb.message = breadcrumb.message.slice(0, 1024) + '...[truncated]';
        }
      }
      return breadcrumb;
    },
  });

  initialized = true;
  return true;
}

export { Sentry };

/**
 * Critical path için manuel span wrapper.
 *
 * Kullanım:
 *   const result = await withSpan('check-in.trust-score', async () => {
 *     return computeTrustScore(...);
 *   }, { user_id: req.authUserId });
 *
 * Sentry tracing'de görünür: damga-api / check-in.trust-score / 145ms
 *
 * Sample rate %10 olduğu için ortalama her 10 çağrıdan 1'i toplanır.
 * Critical path'ler için manuel span eklemek, otomatik HTTP/Express integration'a
 * göre daha granular insight verir.
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes: Record<string, string | number | boolean> = {},
): Promise<T> {
  if (!initialized) return fn(); // Sentry yoksa overhead yok
  return Sentry.startSpan({ name, attributes }, async () => fn());
}

/**
 * Span ile birlikte hata yakalama.
 * Hata olursa span'a işaretler + Sentry'ye gönderir, sonra re-throw eder.
 */
export async function withSpanAndCapture<T>(
  name: string,
  fn: () => Promise<T>,
  attributes: Record<string, string | number | boolean> = {},
): Promise<T> {
  if (!initialized) return fn();
  return Sentry.startSpan({ name, attributes }, async (span) => {
    try {
      return await fn();
    } catch (err) {
      span?.setStatus?.({ code: 2, message: 'internal_error' });
      Sentry.captureException(err);
      throw err;
    }
  });
}

/**
 * Custom event capture — non-error business event'leri.
 *
 * Örnek: damga reddedildi, kullanıcı 10x retry yapıyor vs.
 */
export function captureBusinessEvent(name: string, data: Record<string, unknown> = {}): void {
  if (!initialized) return;
  Sentry.captureMessage(name, {
    level: 'info',
    extra: data,
    tags: { type: 'business_event' },
  });
}
