import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * platform_services — Platform sahibinin (Kaan) kullandığı dış servislerin
 * merkezi yönetimi. UI: /platform → "Dış Servisler" sekmesi.
 *
 * Sadece platform admin erişebilir (requirePlatformAdmin middleware).
 * RLS enabled, policy yok = default deny; service_role bypass eder.
 *
 * ⚠️ Hassas key/şifreler BURADA SAKLANMAZ — sadece referans bilgi.
 * Gerçek secrets Bitwarden vault'unda; `bitwarden_note_name` ile referans verilir.
 */
export const platformServices = pgTable(
  'platform_services',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** Servisin görünen adı (örn "Hetzner Cloud", "Supabase") */
    name: text('name').notNull(),
    /**
     * Kategori — UI'da gruplamak için.
     * infra | database | email | auth | push | repo | payment | monitoring | security | dns
     */
    category: text('category').notNull(),
    /** Dashboard / panel URL'i (örn https://supabase.com/dashboard) */
    dashboard_url: text('dashboard_url').notNull(),
    /** Hesap email'i veya kullanıcı adı (örn "kaanklc498@gmail.com", "klchappy") */
    account_identifier: text('account_identifier'),
    /** Plan/tier bilgisi (örn "Free", "CX22 €4/ay") */
    plan: text('plan'),
    /** active | setup_pending | inactive | deprecated */
    status: text('status').notNull().default('active'),
    /** Serbest notlar (markdown). Örn "Region: EU, Pro'ya yükseltilecek" */
    notes: text('notes'),
    /** Bitwarden'da hangi note'a bakılır (örn "Damga Sistem Envanteri") */
    bitwarden_note_name: text('bitwarden_note_name'),
    /** Lucide icon adı (UI'da göstermek için) */
    icon: text('icon'),
    /** Sıralama için (UI'da düzenli görünüm) */
    display_order: integer('display_order').notNull().default(0),
    created_by: uuid('created_by').references(() => users.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    categoryIdx: index('idx_platform_services_category').on(table.category),
    orderIdx: index('idx_platform_services_order').on(table.display_order),
  }),
);

export type PlatformService = typeof platformServices.$inferSelect;
export type NewPlatformService = typeof platformServices.$inferInsert;
