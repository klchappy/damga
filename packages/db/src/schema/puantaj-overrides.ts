import { sql } from 'drizzle-orm';
import {
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { users } from './users';

/**
 * puantaj_overrides — admin/manager tarafından elle düzeltilmiş puantaj kodları.
 *
 * Damga normalde puantaj kodlarını event/leave verisinden OTOMATIK türetir:
 *   - check-in event varsa → X / RX
 *   - onaylı leave varsa → R / YI / IZ / DI
 *   - hafta sonu → H
 *   - hafta içi kayıt yok → G
 *
 * Bazen düzeltme gerekir (örn: check-in unutuldu, izin geç onaylandı, hatalı kod).
 * Bu tabloda her override:
 *   - bir (org_id, user_id, date) kombinasyonu için tek satır (unique)
 *   - code: 8 kod (X/H/RX/R/IZ/G/DI/YI) — null ise "auto-derive'a geri dön"
 *   - set_by: hangi admin/manager override yaptı
 *   - reason: opsiyonel açıklama (audit için)
 *
 * Derive katmanı: önce override bak, yoksa otomatik türet.
 *
 * Audit: tüm değişiklikler logger.info + Sentry'ye düşer. Geçmiş izini için
 * ileride append-only audit log eklenebilir; şimdilik updated_at + set_by yeterli.
 */
export const puantajOverrides = pgTable(
  'puantaj_overrides',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** YYYY-MM-DD — hangi gün için override */
    date: date('date').notNull(),
    /**
     * Puantaj kodu: X / H / RX / R / IZ / G / DI / YI
     * Null değer kabul edilmez — clearing için satırı sil
     */
    code: text('code').notNull(),
    /** Opsiyonel açıklama (örn: "check-in unutuldu", "izin geç onaylandı") */
    reason: text('reason'),
    /** Override'i yapan admin/manager */
    set_by: uuid('set_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Bir org+user+date için tek override (upsert on conflict)
    uniqOrgUserDate: uniqueIndex('uniq_puantaj_override_org_user_date').on(
      table.org_id,
      table.user_id,
      table.date,
    ),
    // Listing performansı için (ay sorgusu)
    orgDateIdx: index('idx_puantaj_override_org_date').on(
      table.org_id,
      table.date,
    ),
  }),
);

export type PuantajOverride = typeof puantajOverrides.$inferSelect;
export type NewPuantajOverride = typeof puantajOverrides.$inferInsert;
