import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) throw new Error('DATABASE_URL gerekli');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.auth_failed_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      identifier text NOT NULL,
      ip_address text,
      user_agent text,
      succeeded boolean NOT NULL DEFAULT false,
      failure_reason text,
      lockout_minutes integer,
      attempted_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_auth_attempts_identifier_time
      ON public.auth_failed_attempts(lower(identifier), attempted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip_time
      ON public.auth_failed_attempts(ip_address, attempted_at DESC);
    ALTER TABLE public.auth_failed_attempts ENABLE ROW LEVEL SECURITY;
  `);
  console.log('✓ auth_failed_attempts tablo + index + RLS');
  await client.end();
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
