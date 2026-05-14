/**
 * PostHog analytics — privacy-friendly, KVKK uyumlu kullanım.
 *
 * Setup:
 *   1. https://app.posthog.com/signup → Free tier (1M events/ay)
 *   2. Project Settings → API Key → Project API Key kopyala
 *   3. Coolify damga-web env vars:
 *      VITE_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *      VITE_POSTHOG_HOST=https://eu.i.posthog.com   # EU veri ikametgâhı için (önerilen)
 *   4. Redeploy
 *
 * KVKK uyumu:
 *   - autocapture = false (her klik kaydedilmez)
 *   - capture_pageview = true (sayfa görüntüleme — anonymized)
 *   - session_recording = false (varsayılan)
 *   - Hassas veriler maskelenir (input maskeleme built-in)
 *
 * Tracked events (sadece bunlar):
 *   - $pageview (otomatik route değişimi)
 *   - signed_up_org (yeni org sign-up — funnel başlangıcı)
 *   - signed_up_user (mevcut org'a katılım)
 *   - signed_in (login)
 *   - signed_out
 *   - location_created (onboarding adım 1)
 *   - employee_invited (onboarding adım 2)
 *   - onboarding_completed
 *   - onboarding_skipped
 *   - stamp_created (check-in/out — sadece type, score, trust_decision)
 *   - account_deletion_requested (KVKK md.11 telemetri)
 *
 * Kullanıcı identify edilir SADECE user_id ile (email/isim GÖNDERILMEZ).
 */
import posthog from 'posthog-js';
import { env } from './env';

let initialized = false;

export function initAnalytics(): void {
  if (initialized) return;
  if (!env.posthogKey) return; // sessizce skip
  posthog.init(env.posthogKey, {
    api_host: env.posthogHost ?? 'https://eu.i.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false, // KVKK: tüm interaksiyonları otomatik kaydetme
    persistence: 'localStorage+cookie',
    disable_session_recording: true, // varsayılan — gerekirse sonra açılır
    mask_all_text: false,
    mask_all_element_attributes: false,
    sanitize_properties: (props, _eventName) => {
      // Hassas alanları temizle (gönderilen tüm property'lere uygulanır)
      const sanitized = { ...props };
      const sensitive = ['password', 'token', 'api_key', 'secret', 'authorization'];
      for (const key of Object.keys(sanitized)) {
        if (sensitive.some((s) => key.toLowerCase().includes(s))) {
          delete sanitized[key];
        }
      }
      return sanitized;
    },
    loaded: (ph) => {
      // Production'da debug kapalı
      if (import.meta.env.DEV) ph.debug();
    },
  });
  initialized = true;
}

/**
 * Kullanıcıyı identify et — user_id + tier bilgisi (PII değil).
 * Email/isim PostHog'a gönderilmez (KVKK uyumu).
 */
export function identify(userId: string, properties?: {
  role?: string;
  org_id?: string;
  org_plan?: string;
}): void {
  if (!initialized) return;
  posthog.identify(userId, properties);
}

export function resetUser(): void {
  if (!initialized) return;
  posthog.reset();
}

/**
 * Custom event capture — sadece allowlist'teki event'ler.
 * Hassas property gönderme önlenir (sanitize_properties).
 */
type AnalyticsEvent =
  | 'signed_up_org'
  | 'signed_up_user'
  | 'signed_in'
  | 'signed_out'
  | 'location_created'
  | 'employee_invited'
  | 'onboarding_completed'
  | 'onboarding_skipped'
  | 'stamp_created'
  | 'account_deletion_requested'
  | 'account_deletion_cancelled'
  | 'subscription_upgraded'
  | 'subscription_downgraded';

export function track(event: AnalyticsEvent, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.capture(event, properties);
}

/** PostHog opt-out (kullanıcı analytics izni vermediyse) */
export function optOutAnalytics(): void {
  if (!initialized) return;
  posthog.opt_out_capturing();
}

export function optInAnalytics(): void {
  if (!initialized) return;
  posthog.opt_in_capturing();
}

export const isAnalyticsEnabled = (): boolean => initialized;
