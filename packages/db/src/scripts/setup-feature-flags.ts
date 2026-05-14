import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) throw new Error('DATABASE_URL gerekli');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.feature_flags (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key text NOT NULL UNIQUE,
      description text,
      enabled boolean NOT NULL DEFAULT false,
      rules jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON public.feature_flags(key);
    ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
  `);
  console.log('✓ feature_flags tablo + index + RLS');

  // Seed örnek flag'ler (hepsi default kapalı, sadece tanım)
  const seeds = [
    { key: 'new_dashboard', description: 'Yeni dashboard tasarımı (2026 Q4 redesign)' },
    { key: 'sms_2fa', description: 'SMS-based 2FA (TOTP yerine alternatif)' },
    { key: 'beta_bordro_excel', description: 'Bordro export Excel formatında (XLSX)' },
    { key: 'video_kvkk_consent', description: 'KVKK rıza için video onay özelliği' },
    { key: 'ai_anomaly_detection', description: 'AI-based anomali tespiti (vs. kural-tabanlı)' },
  ];
  for (const s of seeds) {
    await client.query(
      `INSERT INTO public.feature_flags (key, description, enabled, rules)
       VALUES ($1, $2, false, '{}'::jsonb)
       ON CONFLICT (key) DO NOTHING`,
      [s.key, s.description],
    );
  }
  console.log(`✓ ${seeds.length} placeholder flag eklendi (hepsi disabled)`);

  await client.end();
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
