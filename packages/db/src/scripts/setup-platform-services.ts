/**
 * Tek seferlik script: platform_services tablosu oluştur + RLS enable + 8 mevcut servisi seed et.
 * Drizzle migration meta sorunu nedeniyle ham SQL ile yapılıyor.
 */
import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) throw new Error('DATABASE_URL gerekli');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // 1) Tablo oluştur
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.platform_services (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      category text NOT NULL,
      dashboard_url text NOT NULL,
      account_identifier text,
      plan text,
      status text NOT NULL DEFAULT 'active',
      notes text,
      bitwarden_note_name text,
      icon text,
      display_order integer NOT NULL DEFAULT 0,
      created_by uuid REFERENCES public.users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_platform_services_category ON public.platform_services(category);
    CREATE INDEX IF NOT EXISTS idx_platform_services_order ON public.platform_services(display_order);
    ALTER TABLE public.platform_services ENABLE ROW LEVEL SECURITY;
  `);
  console.log('✓ Tablo + index + RLS oluşturuldu');

  // 2) Mevcut kayıt var mı?
  const existing = await client.query<{ count: number }>(
    `SELECT count(*)::int as count FROM public.platform_services`,
  );
  if ((existing.rows[0]?.count ?? 0) > 0) {
    console.log(`⚠️  Tabloda zaten ${existing.rows[0]?.count} servis var, seed atlanıyor.`);
    await client.end();
    return;
  }

  // 3) Seed: 8 mevcut servis
  const services = [
    {
      name: 'Hetzner Cloud',
      category: 'infra',
      dashboard_url: 'https://console.hetzner.cloud',
      account_identifier: 'kaanklc498@gmail.com',
      plan: 'CX22 · €4/ay · EU',
      status: 'active',
      notes: 'Ubuntu, 2 vCPU, 4 GB RAM, 40 GB SSD. Damga production sunucusu.',
      bitwarden_note_name: 'Damga Sistem Envanteri',
      icon: 'Server',
      display_order: 10,
    },
    {
      name: 'Coolify',
      category: 'infra',
      dashboard_url: 'https://coolify.deploi.net',
      account_identifier: 'self-hosted',
      plan: 'Free (self-hosted)',
      status: 'active',
      notes: 'Hetzner CX22 üzerinde Docker container orchestrator. damga-web + damga-api containerları.',
      bitwarden_note_name: 'Damga Sistem Envanteri',
      icon: 'Container',
      display_order: 20,
    },
    {
      name: 'Cloudflare',
      category: 'dns',
      dashboard_url: 'https://dash.cloudflare.com',
      account_identifier: 'kaanklc498@gmail.com',
      plan: 'Free tier',
      status: 'active',
      notes: 'DNS + Proxy + DDoS koruma + Edge SSL. deploi.net zonu. Email Routing kurulacak.',
      bitwarden_note_name: 'Damga Sistem Envanteri',
      icon: 'Cloud',
      display_order: 30,
    },
    {
      name: 'Supabase',
      category: 'database',
      dashboard_url: 'https://supabase.com/dashboard/project/tidsuaupjvtviewidbav',
      account_identifier: 'kaanklc498@gmail.com',
      plan: 'Free · EU (Frankfurt)',
      status: 'active',
      notes: 'PostgreSQL + Auth + Storage. Project: damga, Organization: tahminio. Lokma\'dan ayrıldı 2026-05-11. RLS aktif (36 tabloda default-deny).',
      bitwarden_note_name: 'Damga Sistem Envanteri',
      icon: 'Database',
      display_order: 40,
    },
    {
      name: 'GitHub',
      category: 'repo',
      dashboard_url: 'https://github.com/klchappy/damga',
      account_identifier: 'klchappy',
      plan: 'Free · Private repo',
      status: 'active',
      notes: 'main branch → Coolify auto-deploy. Webhooks aktif.',
      bitwarden_note_name: 'Damga Sistem Envanteri',
      icon: 'GitBranch',
      display_order: 50,
    },
    {
      name: 'Resend',
      category: 'email',
      dashboard_url: 'https://resend.com/domains',
      account_identifier: 'kaanklc498@gmail.com',
      plan: 'Free · 100/gün, 3k/ay',
      status: 'active',
      notes: 'Transactional email. Domain verified: deploi.net (SPF+DKIM+DMARC). API key Coolify env\'da.',
      bitwarden_note_name: 'Damga Sistem Envanteri',
      icon: 'Mail',
      display_order: 60,
    },
    {
      name: 'Bitwarden',
      category: 'security',
      dashboard_url: 'https://vault.bitwarden.com',
      account_identifier: 'kaanklc498@gmail.com',
      plan: 'Free',
      status: 'active',
      notes: 'Şifre/key vault. "Damga Sistem Envanteri" notunda tüm hassas bilgiler şifreli.',
      bitwarden_note_name: 'Damga Sistem Envanteri',
      icon: 'KeyRound',
      display_order: 70,
    },
    {
      name: 'Web Push (VAPID)',
      category: 'push',
      dashboard_url: 'https://web-push-codelab.glitch.me',
      account_identifier: 'self-hosted',
      plan: 'Ücretsiz (kendi VAPID anahtarları)',
      status: 'active',
      notes: 'Browser push notification. VAPID anahtarları Coolify env\'da. iOS native push (APNs) ayrı kurulum gerekecek.',
      bitwarden_note_name: 'Damga Sistem Envanteri',
      icon: 'Bell',
      display_order: 80,
    },
  ];

  for (const s of services) {
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
    console.log(`✓ Seed: ${s.name}`);
  }

  const final = await client.query<{ count: number }>(
    `SELECT count(*)::int as count FROM public.platform_services`,
  );
  console.log(`\n✓ Toplam ${final.rows[0]?.count} servis kaydedildi.`);

  await client.end();
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
