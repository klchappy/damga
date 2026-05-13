/**
 * Tek seferlik script: Damga'da tum public.* tablolarda RLS enable + policy yok = default deny.
 * Damga API service_role kullanir, RLS'i bypass eder, kod degismez.
 * Anon (sb_publishable_*) ile Supabase REST API erisimi kapanir.
 *
 * Calistirma: pnpm -F @damga/db exec tsx src/scripts/enable-rls.ts
 */
import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) throw new Error('DATABASE_URL veya DIRECT_URL env\'da yok');
  console.log('Baglaniliyor:', url.replace(/:[^@]*@/, ':<HIDDEN>@'));

  const client = new Client({
    connectionString: url,
    ssl: url.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  // Onceki durum
  const before = await client.query<{ tablename: string; rowsecurity: boolean }>(
    `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const beforeOff = before.rows.filter((r) => !r.rowsecurity);
  console.log(`\nONCE: ${before.rows.length} tablo, RLS kapali: ${beforeOff.length}`);

  // RLS enable
  await client.query(`
    DO $$
    DECLARE t text;
    BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      END LOOP;
    END $$;
  `);
  console.log('\nALTER TABLE ENABLE RLS calistirildi.');

  // Sonraki durum
  const after = await client.query<{ tablename: string; rowsecurity: boolean }>(
    `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const afterOff = after.rows.filter((r) => !r.rowsecurity);
  console.log(`\nSONRA: ${after.rows.length} tablo, RLS kapali: ${afterOff.length}`);
  if (afterOff.length > 0) {
    console.log('Hala kapali:', afterOff.map((r) => r.tablename).join(', '));
  } else {
    console.log('TUM public.* tablolarda RLS ENABLED.');
  }

  // Detayli liste
  console.log('\n--- Tablo durumu ---');
  for (const r of after.rows) {
    console.log(`  ${r.rowsecurity ? 'OK ' : '-- '} ${r.tablename}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error('HATA:', err.message);
  process.exit(1);
});
