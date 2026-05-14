/**
 * UptimeRobot servisini setup_pending durumuna çek + notu güncelle.
 * SaaS aşamasında manuel kurulum gerektiriyor (bot detection ile UI otomasyonu engelleniyor).
 */
import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) throw new Error('DATABASE_URL gerekli');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const r = await client.query(
    `UPDATE public.platform_services
     SET status='setup_pending',
         notes=$1,
         updated_at=now()
     WHERE name='UptimeRobot'
     RETURNING id, name, status`,
    [
      'Account hazır ama UI Cloudflare bot detection nedeniyle otomasyona kapalı. ' +
        '2 monitor manuel eklenecek: damga.deploi.net + api.damga.deploi.net/v1/health (5 dk interval). ' +
        'Public status page oluşturulduğunda URL bu kayda işlenecek.',
    ],
  );
  console.log('Güncellendi:', r.rows[0]);
  await client.end();
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
