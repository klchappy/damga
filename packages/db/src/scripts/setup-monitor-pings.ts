/**
 * Tek seferlik script: monitor_pings tablosu + index + RLS + anon read policy.
 * Drizzle migration meta sorunu nedeniyle ham SQL ile yapılıyor (diğer scripts gibi).
 */
import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) throw new Error('DATABASE_URL gerekli');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.monitor_pings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      target text NOT NULL,
      url text NOT NULL,
      status_code integer NOT NULL,
      latency_ms integer NOT NULL,
      is_up integer NOT NULL,
      error text,
      checked_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_monitor_pings_target_checked_at
      ON public.monitor_pings(target, checked_at DESC);
    CREATE INDEX IF NOT EXISTS idx_monitor_pings_checked_at
      ON public.monitor_pings(checked_at DESC);
    ALTER TABLE public.monitor_pings ENABLE ROW LEVEL SECURITY;
  `);
  console.log('✓ monitor_pings tablo + index + RLS oluşturuldu');

  // Anon REST API'den okuma izni (public status page için)
  // Sadece son 90 gün okunabilsin (eski veriler maskeli)
  await client.query(`
    DROP POLICY IF EXISTS "monitor_pings_anon_read_recent" ON public.monitor_pings;
    CREATE POLICY "monitor_pings_anon_read_recent" ON public.monitor_pings
      FOR SELECT
      USING (checked_at > now() - interval '90 days');
  `);
  console.log('✓ Anon read policy (son 90 gün) eklendi');

  await client.end();
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
