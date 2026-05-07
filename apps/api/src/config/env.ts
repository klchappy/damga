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
  EMAIL_FROM: z.string().default('Damga <noreply@damga.deploi.net>'),

  /** NFC + QR HMAC imzalama secret'ı — production'da MUTLAKA değiştir */
  NFC_SIGNING_SECRET: z
    .string()
    .min(32, 'NFC_SIGNING_SECRET en az 32 karakter olmalı')
    .default('damga-dev-default-secret-change-in-prod-please'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
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
  EMAIL_FROM: 'Damga <noreply@damga.deploi.net>',
  NFC_SIGNING_SECRET: 'damga-dev-default-secret-change-in-prod-please',
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX: 120,
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
};
