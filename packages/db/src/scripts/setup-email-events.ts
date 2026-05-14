/**
 * Tek seferlik: email_events tablosu + RLS.
 */
import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) throw new Error('DATABASE_URL gerekli');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.email_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      resend_event_id text NOT NULL UNIQUE,
      event_type text NOT NULL,
      resend_email_id text,
      from_email text,
      to_email text,
      subject text,
      bounce_type text,
      bounce_reason text,
      org_id uuid REFERENCES public.orgs(id) ON DELETE SET NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      occurred_at timestamptz,
      received_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_email_events_type ON public.email_events(event_type, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_email_events_to ON public.email_events(to_email);
    CREATE INDEX IF NOT EXISTS idx_email_events_org ON public.email_events(org_id, received_at DESC);
    ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
  `);
  console.log('✓ email_events tablo + index + RLS');
  await client.end();
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
