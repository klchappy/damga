import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * auth_failed_attempts — başarısız giriş denemelerinin kaydı.
 *
 * Brute force koruması:
 *   - Aynı identifier (email/username) için son 15 dakikada 5+ başarısız → 15 dk lock
 *   - Aynı IP için son 5 dakikada 10+ başarısız → 1 saat lock (IP rate limit ek)
 *   - Successful login → o identifier için sayaç sıfırlanır (record silinmez, audit)
 *
 * NOT: express-rate-limit zaten per-IP koruma yapıyor. Bu, KULLANICI-bazlı
 * dağıtık brute force'a karşı (farklı IP'lerden aynı user'a saldırı).
 *
 * Saklama: 30 gün (audit + monitoring). Cron temizler.
 */
export const authFailedAttempts = pgTable(
  'auth_failed_attempts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** Email veya username (lookup için lowercase) */
    identifier: text('identifier').notNull(),
    /** Request'in geldiği IP (Cloudflare CF-Connecting-IP veya x-forwarded-for) */
    ip_address: text('ip_address'),
    /** User Agent (basit fingerprint) */
    user_agent: text('user_agent'),
    /** Başarılı login mi? (true ise sayım için dahil edilmez, sadece audit) */
    succeeded: boolean('succeeded').notNull().default(false),
    /** Hata tipi: invalid_password | user_not_found | rate_limited | mfa_failed | lockout */
    failure_reason: text('failure_reason'),
    /** Lockout durumunda: bu attempt sonrası kaç dakika lock kalacak */
    lockout_minutes: integer('lockout_minutes'),
    attempted_at: timestamp('attempted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    identifierTimeIdx: index('idx_auth_attempts_identifier_time').on(
      table.identifier,
      table.attempted_at,
    ),
    ipTimeIdx: index('idx_auth_attempts_ip_time').on(table.ip_address, table.attempted_at),
  }),
);

export type AuthFailedAttempt = typeof authFailedAttempts.$inferSelect;
export type NewAuthFailedAttempt = typeof authFailedAttempts.$inferInsert;
