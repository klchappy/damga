/**
 * Tek seferlik script: users tablosuna KVKK md.11 self-serve silme
 * için alanlar ekler.
 *
 * Akış:
 *   1. Kullanıcı "hesabımı sil" → deletion_requested_at = now(),
 *      deletion_scheduled_at = now() + 30 gün, deletion_reason = (opsiyonel)
 *   2. is_active = false (giriş yapamaz ama kayıt durur)
 *   3. 30 gün içinde geri alabilir (kullanıcı: cancel-deletion endpoint)
 *   4. 30 gün sonra cron: anonymize (full_name='[Silinmiş]', email=NULL, phone=NULL...)
 *      ve deleted_at = now()
 *   5. 90 gün sonra cron: hard delete (CASCADE etkili — events vs.)
 *
 * Schema'da görünecek alanlar:
 *   - deleted_at        (anonymize timestamp)
 *   - deletion_requested_at  (kullanıcı talebi)
 *   - deletion_scheduled_at  (otomatik anonymize tarihi)
 *   - deletion_reason   (kullanıcının verdiği gerekçe, opsiyonel)
 */
import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) throw new Error('DATABASE_URL gerekli');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
      ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz,
      ADD COLUMN IF NOT EXISTS deletion_reason text,
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
  `);
  console.log('✓ users tablosuna deletion alanları eklendi');

  // Cron için index: deletion_scheduled_at < now() + deleted_at IS NULL → anonymize sırası
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_users_deletion_scheduled
      ON public.users(deletion_scheduled_at)
      WHERE deletion_scheduled_at IS NOT NULL AND deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_users_deleted_at
      ON public.users(deleted_at)
      WHERE deleted_at IS NOT NULL;
  `);
  console.log('✓ Partial index\'ler eklendi');

  await client.end();
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
