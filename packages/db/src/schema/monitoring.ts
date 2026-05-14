import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * monitor_pings — Native uptime monitoring (UptimeRobot yerine self-hosted).
 *
 * Her 5 dakikada bir cron job (apps/api/src/lib/health-monitor.ts) damga.deploi.net
 * ve api.damga.deploi.net/v1/health endpoint'lerini ping atar ve buraya yazar.
 *
 * Public endpoint: GET /v1/status → son 24 saat verisi (auth gerektirmez).
 * Public page: https://damga.deploi.net/status → grafik gösterimi.
 *
 * RLS: anon read için policy var (status sayfası public), insert sadece service_role.
 *
 * Eski kayıtlar 90 günde otomatik temizlenir (retention job).
 */
export const monitorPings = pgTable(
  'monitor_pings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** İzlenen target: 'web' | 'api' */
    target: text('target').notNull(),
    /** Hedef URL (örn "https://damga.deploi.net", "https://api.damga.deploi.net/v1/health") */
    url: text('url').notNull(),
    /** HTTP durum kodu (0 = bağlantı hatası, timeout vs.) */
    status_code: integer('status_code').notNull(),
    /** İstek süresi (millisaniye) */
    latency_ms: integer('latency_ms').notNull(),
    /** Up sayılır mı (200-299) */
    is_up: integer('is_up').notNull(), // 1 | 0 (sql/Drizzle pg-core'da boolean yerine int kullanıyoruz, mevcut tablolar gibi)
    /** Hata mesajı (varsa) */
    error: text('error'),
    /** Ölçüm zamanı */
    checked_at: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    targetCheckedAtIdx: index('idx_monitor_pings_target_checked_at').on(
      table.target,
      table.checked_at,
    ),
    checkedAtIdx: index('idx_monitor_pings_checked_at').on(table.checked_at),
  }),
);

export type MonitorPing = typeof monitorPings.$inferSelect;
export type NewMonitorPing = typeof monitorPings.$inferInsert;
