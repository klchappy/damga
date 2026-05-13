/**
 * Tek seferlik check: platform_services tablosu var mı?
 */
import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) throw new Error('DATABASE_URL gerekli');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const r = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists`,
    ['platform_services'],
  );
  console.log('platform_services tablosu mevcut mu:', r.rows[0]?.exists);
  if (r.rows[0]?.exists) {
    const cols = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'platform_services'`,
    );
    console.log('Kolonlar:', cols.rows);
  }
  await client.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
