/**
 * Tek seferlik script: Sentry + UptimeRobot servislerini platform_services'a ekle.
 * Idempotent (name'e göre upsert).
 */
import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) throw new Error('DATABASE_URL gerekli');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const services = [
    {
      name: 'Sentry',
      category: 'monitoring',
      dashboard_url: 'https://deploinet.sentry.io/projects/',
      account_identifier: 'kaanklc498@gmail.com',
      plan: 'Developer · Free (5k events/ay)',
      status: 'active',
      notes:
        'Error tracking + performance monitoring. 2 proje: damga-api (Node) ve damga-web (React). DSN\'ler Coolify env\'da (SENTRY_DSN + VITE_SENTRY_DSN). Trace sample rate %10. KVKK uyumu: sendDefaultPii=false, hassas header\'lar filtrelenir.',
      bitwarden_note_name: 'Damga Sistem Envanteri',
      icon: 'AlertTriangle',
      display_order: 90,
    },
    {
      name: 'UptimeRobot',
      category: 'monitoring',
      dashboard_url: 'https://dashboard.uptimerobot.com/monitors',
      account_identifier: 'kaanklc498@gmail.com',
      plan: 'Free · 50 monitor · 5 dk interval',
      status: 'active',
      notes:
        '2 monitor: damga.deploi.net (web) + api.damga.deploi.net/v1/health (api). Public status page yayınlanabilir. Down olursa email bildirim.',
      bitwarden_note_name: 'Damga Sistem Envanteri',
      icon: 'Activity',
      display_order: 100,
    },
  ];

  for (const s of services) {
    // Upsert by name
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM public.platform_services WHERE name = $1`,
      [s.name],
    );
    if (existing.rows[0]) {
      await client.query(
        `UPDATE public.platform_services
         SET category=$2, dashboard_url=$3, account_identifier=$4, plan=$5, status=$6,
             notes=$7, bitwarden_note_name=$8, icon=$9, display_order=$10, updated_at=now()
         WHERE id=$1`,
        [
          existing.rows[0].id,
          s.category,
          s.dashboard_url,
          s.account_identifier,
          s.plan,
          s.status,
          s.notes,
          s.bitwarden_note_name,
          s.icon,
          s.display_order,
        ],
      );
      console.log(`↻ Güncellendi: ${s.name}`);
    } else {
      await client.query(
        `INSERT INTO public.platform_services
          (name, category, dashboard_url, account_identifier, plan, status, notes, bitwarden_note_name, icon, display_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          s.name,
          s.category,
          s.dashboard_url,
          s.account_identifier,
          s.plan,
          s.status,
          s.notes,
          s.bitwarden_note_name,
          s.icon,
          s.display_order,
        ],
      );
      console.log(`✓ Eklendi: ${s.name}`);
    }
  }

  const final = await client.query<{ count: number }>(
    `SELECT count(*)::int as count FROM public.platform_services`,
  );
  console.log(`\n✓ Toplam ${final.rows[0]?.count} servis kayıtlı.`);

  await client.end();
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
