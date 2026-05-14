import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, '../../../../.env'), override: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),
  CLIENT_URL: z.string().url().default('http://localhost:5273'),
  SERVER_URL: z.string().url().default('http://localhost:4100'),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),

  REDIS_URL: z.string().min(1).optional(),

  RESEND_API_KEY: z.string().optional(),
  /** Resend webhook signing secret (svix-id, svix-timestamp, svix-signature header doğrulaması) */
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  EMAIL_FROM: z.string().default('Damga <noreply@deploi.net>'),
  CONTACT_EMAIL: z.string().email().default('damga@deploi.net'),
  SUPPORT_EMAIL: z.string().email().default('destek@deploi.net'),
  KVKK_EMAIL: z.string().email().default('kvkk@deploi.net'),

  /** NFC + QR HMAC imzalama secret'ı — production'da MUTLAKA değiştir */
  NFC_SIGNING_SECRET: z
    .string()
    .min(32, 'NFC_SIGNING_SECRET en az 32 karakter olmalı')
    .default('damga-dev-default-secret-change-in-prod-please'),
  INTEGRATION_ENCRYPTION_KEY: z
    .string()
    .min(32, 'INTEGRATION_ENCRYPTION_KEY en az 32 karakter olmalı')
    .optional(),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

  /** Web Push (VAPID) — production'da MUTLAKA set'le */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:noreply@deploi.net'),

  /** Sentry error tracking — opsiyonel, set değilse init skip */
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Geçersiz environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

const fallback = {
  NODE_ENV: 'development' as const,
  PORT: 4100,
  CLIENT_URL: 'http://localhost:5273',
  SERVER_URL: 'http://localhost:4100',
  DATABASE_URL: '',
  EMAIL_FROM: 'Damga <noreply@deploi.net>',
  CONTACT_EMAIL: 'damga@deploi.net',
  SUPPORT_EMAIL: 'destek@deploi.net',
  KVKK_EMAIL: 'kvkk@deploi.net',
  NFC_SIGNING_SECRET: 'damga-dev-default-secret-change-in-prod-please',
  INTEGRATION_ENCRYPTION_KEY: undefined,
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX: 120,
  VAPID_SUBJECT: 'mailto:noreply@deploi.net',
};

export const env = (parsed.success
  ? parsed.data
  : { ...fallback, ...process.env }) as z.infer<typeof envSchema>;

export const isProd = env.NODE_ENV === 'production';
export const isConfigured = {
  db: Boolean(env.DATABASE_URL),
  supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
  redis: Boolean(env.REDIS_URL),
  resend: Boolean(env.RESEND_API_KEY),
  webPush: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
  sentry: Boolean(env.SENTRY_DSN),
};
