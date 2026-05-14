/**
 * Tek seferlik: pg_stat_statements extension'ı aç + slow query monitoring view oluştur.
 *
 * pg_stat_statements PostgreSQL'in standart extension'ı — her query'nin
 * total süresi, çağrı sayısı, planlanma süresi vb. istatistiklerini tutar.
 *
 * Kullanım sonrası:
 *   SELECT * FROM public.v_slow_queries LIMIT 10;
 *
 * Supabase'de extension genelde aktif gelir. Aktif değilse manuel:
 *   Dashboard > Database > Extensions > pg_stat_statements > Enable
 */
import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) throw new Error('DATABASE_URL gerekli');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // 1. Extension aktif olduğunu doğrula (Supabase'de varsayılan)
  const ext = await client.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM pg_extension WHERE extname = 'pg_stat_statements'`,
  );
  if ((ext.rows[0]?.count ?? 0) === 0) {
    console.log('⚠️  pg_stat_statements yok. Supabase dashboard > Extensions\'tan aç.');
    console.log('   (Veya: CREATE EXTENSION IF NOT EXISTS pg_stat_statements;)');
  } else {
    console.log('✓ pg_stat_statements aktif');
  }

  // 2. Slow query view'ı — son tetiklenmiş, en uzun süren 50 query
  // Bunlar performans audit için ana kaynak.
  await client.query(`
    CREATE OR REPLACE VIEW public.v_slow_queries AS
    SELECT
      queryid,
      substring(query, 1, 200) AS query_preview,
      calls,
      round(total_exec_time::numeric, 2) AS total_ms,
      round(mean_exec_time::numeric, 2) AS mean_ms,
      round((total_exec_time / calls)::numeric, 2) AS avg_ms,
      rows AS total_rows,
      round(rows::numeric / calls, 1) AS rows_per_call,
      round((shared_blks_hit::numeric / nullif(shared_blks_hit + shared_blks_read, 0)) * 100, 1) AS cache_hit_pct
    FROM pg_stat_statements
    WHERE query NOT LIKE '%pg_stat_statements%'
      AND query NOT LIKE '%information_schema%'
      AND calls > 5
    ORDER BY mean_exec_time DESC
    LIMIT 50;
  `);
  console.log('✓ v_slow_queries view (mean süresi en uzun 50 query)');

  // 3. DB boyut view'ı — büyüyen tabloları izle
  await client.query(`
    CREATE OR REPLACE VIEW public.v_table_sizes AS
    SELECT
      schemaname,
      relname AS tablename,
      pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) AS total_size,
      pg_size_pretty(pg_relation_size(schemaname || '.' || relname)) AS table_size,
      pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname) - pg_relation_size(schemaname || '.' || relname)) AS index_size,
      n_live_tup AS row_count
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname || '.' || relname) DESC;
  `);
  console.log('✓ v_table_sizes view');

  // 4. Org-bazlı kullanım analytics view (platform admin için)
  await client.query(`
    CREATE OR REPLACE VIEW public.v_org_usage AS
    SELECT
      o.id AS org_id,
      o.name AS org_name,
      o.plan,
      o.created_at AS org_created_at,
      (SELECT count(*) FROM public.users WHERE org_id = o.id AND is_active = true) AS active_users,
      (SELECT count(*) FROM public.locations WHERE org_id = o.id AND is_active = true) AS locations_count,
      (SELECT count(*) FROM public.attendance_events WHERE org_id = o.id AND server_time > now() - interval '30 days') AS stamps_30d,
      (SELECT count(*) FROM public.attendance_events WHERE org_id = o.id AND server_time > now() - interval '7 days') AS stamps_7d,
      (SELECT max(server_time) FROM public.attendance_events WHERE org_id = o.id) AS last_stamp_at,
      (SELECT count(*) FROM public.api_keys WHERE org_id = o.id AND is_active = true) AS active_api_keys,
      (SELECT count(*) FROM public.webhooks WHERE org_id = o.id AND is_active = true) AS active_webhooks
    FROM public.orgs o
    ORDER BY active_users DESC;
  `);
  console.log('✓ v_org_usage view (per-org aktiflik)');

  // 5. Damga sağlığı view (anomali, reddedilen, geç kalma %)
  await client.query(`
    CREATE OR REPLACE VIEW public.v_stamp_health AS
    SELECT
      org_id,
      date_trunc('day', server_time AT TIME ZONE 'Europe/Istanbul') AS day,
      count(*) AS total_stamps,
      count(*) FILTER (WHERE review_status = 'approved') AS approved,
      count(*) FILTER (WHERE review_status = 'pending_review') AS pending,
      count(*) FILTER (WHERE review_status = 'rejected') AS rejected,
      round(avg(verification_score)::numeric, 1) AS avg_trust_score,
      count(*) FILTER (WHERE 'out_of_geofence' = ANY(review_reasons)) AS out_of_geofence
    FROM public.attendance_events
    WHERE server_time > now() - interval '90 days'
    GROUP BY org_id, day
    ORDER BY day DESC;
  `);
  console.log('✓ v_stamp_health view (günlük damga sağlığı per-org)');

  await client.end();
  console.log('\n✓ Tüm view\'lar oluşturuldu. Kullanım:');
  console.log('  SELECT * FROM public.v_slow_queries LIMIT 10;');
  console.log('  SELECT * FROM public.v_table_sizes LIMIT 20;');
  console.log('  SELECT * FROM public.v_org_usage;');
  console.log('  SELECT * FROM public.v_stamp_health WHERE org_id = \'...\' LIMIT 30;');
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
