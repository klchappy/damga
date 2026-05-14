/**
 * Production performance hardening — ek index'ler.
 *
 * Mevcut index'lere ek olarak, sık kullanılan filter/sort kombinasyonlarına
 * partial + composite index'ler eklenir.
 */
import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) throw new Error('DATABASE_URL gerekli');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const indexes = [
    // attendance_events — en sık sorgulanan tablo
    {
      name: 'idx_events_user_time',
      sql: `CREATE INDEX IF NOT EXISTS idx_events_user_time ON public.attendance_events(user_id, server_time DESC)`,
    },
    {
      name: 'idx_events_org_time',
      sql: `CREATE INDEX IF NOT EXISTS idx_events_org_time ON public.attendance_events(org_id, server_time DESC)`,
    },
    {
      name: 'idx_events_pending',
      sql: `CREATE INDEX IF NOT EXISTS idx_events_pending ON public.attendance_events(org_id, server_time DESC) WHERE review_status = 'pending_review'`,
    },
    // users — org filtreli sorgular
    {
      name: 'idx_users_org_active',
      sql: `CREATE INDEX IF NOT EXISTS idx_users_org_active ON public.users(org_id, is_active) WHERE deleted_at IS NULL`,
    },
    // notifications — bell badge query
    {
      name: 'idx_notifications_user_unread_time',
      sql: `CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_time ON public.notifications(user_id, created_at DESC) WHERE is_read = false`,
    },
    // leaves — manager pending review query
    {
      name: 'idx_leaves_org_pending',
      sql: `CREATE INDEX IF NOT EXISTS idx_leaves_org_pending ON public.leaves(org_id, created_at DESC) WHERE status = 'pending'`,
    },
    // api_keys — last_used update queue + bcrypt lookup
    {
      name: 'idx_api_keys_active_org',
      sql: `CREATE INDEX IF NOT EXISTS idx_api_keys_active_org ON public.api_keys(org_id) WHERE is_active = true`,
    },
    // webhooks — delivery queue
    {
      name: 'idx_webhooks_active_org',
      sql: `CREATE INDEX IF NOT EXISTS idx_webhooks_active_org ON public.webhooks(org_id) WHERE is_active = true`,
    },
    // monitor_pings — already has partial; tek bir composite ekle
    {
      name: 'idx_monitor_pings_target_recent',
      sql: `CREATE INDEX IF NOT EXISTS idx_monitor_pings_target_recent ON public.monitor_pings(target, checked_at DESC) WHERE is_up = 1`,
    },
  ];

  for (const idx of indexes) {
    try {
      await client.query(idx.sql);
      console.log(`✓ ${idx.name}`);
    } catch (e) {
      console.error(`✗ ${idx.name}: ${(e as Error).message}`);
    }
  }

  // ANALYZE — yeni index'leri sorgu planlayıcısına bildir
  console.log('\nANALYZE çalıştırılıyor...');
  await client.query('ANALYZE');
  console.log('✓ ANALYZE tamam');

  await client.end();
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
