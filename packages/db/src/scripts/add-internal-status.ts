/**
 * UptimeRobot kaydını "Damga Internal Status" olarak yeniden adlandır
 * (UptimeRobot dashboard'u Cloudflare Bot Management nedeniyle otomasyona açık değil,
 * bu yüzden self-hosted internal status page yapıldı: /v1/status + /status sayfası).
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
     SET name='Damga Internal Status',
         category='monitoring',
         dashboard_url='https://damga.deploi.net/status',
         account_identifier='self-hosted',
         plan='Built-in (5 dk interval, 90 gün retention)',
         status='active',
         notes=$1,
         bitwarden_note_name=NULL,
         icon='Activity',
         display_order=100,
         updated_at=now()
     WHERE name='UptimeRobot'
     RETURNING id, name, status, dashboard_url`,
    [
      'Native uptime monitoring. damga-api içinde 5 dakikada bir damga.deploi.net ve ' +
        'api.damga.deploi.net/v1/health endpoint\'lerini ping atar, monitor_pings tablosuna yazar. ' +
        'Public status page: https://damga.deploi.net/status (auth gerektirmez). ' +
        '90 gün veri saklama. UptimeRobot SPA bot detection ile bloke olduğu için kullanılmadı.',
    ],
  );
  console.log('Güncellendi:', r.rows[0]);
  await client.end();
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
