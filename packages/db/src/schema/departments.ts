import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

/**
 * departments — organizasyona bağlı departmanlar.
 * Org oluşturulduğunda 4 default departman seed edilir:
 *   - Satış (sales)
 *   - Sevk (shipping)
 *   - Muhasebe (accounting)
 *   - Diğer (other)
 *
 * Admin yeni departman ekleyebilir / silebilir / yeniden adlandırabilir.
 * `users.department` field'ı string olarak departments.slug ile eşleşir.
 */
export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    /** Görünen ad — Türkçe (örn "Satış") */
    name: text('name').notNull(),
    /** URL-safe slug (örn "satis", "sevk", "muhasebe", "diger") — unique per org */
    slug: text('slug').notNull(),
    /** Tailwind hex (örn "#FF6B35") — UI badge rengi */
    color: text('color').notNull().default('#FF6B35'),
    /** Default seed mi? (silmeyi engellemek için kullanılabilir) */
    is_default: boolean('is_default').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('idx_dept_org').on(table.org_id),
    orgSlugUnique: uniqueIndex('idx_dept_org_slug').on(table.org_id, table.slug),
  }),
);

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
