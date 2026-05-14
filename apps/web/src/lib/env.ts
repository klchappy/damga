/// <reference types="vite/client" />

export const env = {
  apiUrl: (import.meta.env.VITE_API_URL as string) || '/v1',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  sentryDsn: import.meta.env.VITE_SENTRY_DSN as string | undefined,
  posthogKey: import.meta.env.VITE_POSTHOG_KEY as string | undefined,
  posthogHost: import.meta.env.VITE_POSTHOG_HOST as string | undefined,
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isSentryConfigured = Boolean(env.sentryDsn);
export const isAnalyticsConfigured = Boolean(env.posthogKey);
