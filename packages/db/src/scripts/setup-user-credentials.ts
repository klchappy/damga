/**
 * Tek seferlik script: user_stamp_credentials tablosu + index + RLS.
 */
import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) throw new Error('DATABASE_URL gerekli');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.user_stamp_credentials (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      credential_type text NOT NULL,
      credential_prefix text NOT NULL,
      credential_value_hash text NOT NULL,
      label text,
      is_active boolean NOT NULL DEFAULT true,
      last_used_at timestamptz,
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_stamp_creds_org ON public.user_stamp_credentials(org_id);
    CREATE INDEX IF NOT EXISTS idx_stamp_creds_user ON public.user_stamp_credentials(user_id);
    CREATE INDEX IF NOT EXISTS idx_stamp_creds_prefix ON public.user_stamp_credentials(credential_prefix);
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_stamp_creds_prefix ON public.user_stamp_credentials(credential_prefix);
    ALTER TABLE public.user_stamp_credentials ENABLE ROW LEVEL SECURITY;
  `);
  console.log('✓ user_stamp_credentials tablosu + index + RLS oluşturuldu');

  await client.end();
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
