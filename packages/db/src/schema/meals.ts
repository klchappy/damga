import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { users } from './users';

/**
 * kitchen_qrs — şirketin yemekhanesi/mutfağı için QR kodları.
 * Owner/admin oluşturur, personel okutarak günlük yemek geri bildirimi verir.
 */
export const kitchenQrs = pgTable(
  'kitchen_qrs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    /** İnsan-okunabilir isim: "Ana Yemekhane", "B Blok Kafeterya" */
    name: text('name').notNull(),
    /** Opaque token (base64url, 32 bytes) — QR payload bu */
    token: text('token').notNull().unique(),
    is_active: boolean('is_active').notNull().default(true),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    archived_at: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => ({
    orgActiveIdx: index('idx_kitchen_qrs_org').on(table.org_id, table.is_active),
  }),
);

export type KitchenQr = typeof kitchenQrs.$inferSelect;
export type NewKitchenQr = typeof kitchenQrs.$inferInsert;

/**
 * meal_feedbacks — personelin yemek geri bildirimi (rating + yorum).
 * Günde 1 kez kontrolü için (user_id, ate_on) unique.
 */
export const mealFeedbacks = pgTable(
  'meal_feedbacks',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kitchen_qr_id: uuid('kitchen_qr_id')
      .notNull()
      .references(() => kitchenQrs.id, { onDelete: 'cascade' }),
    /** 1-5 yıldız (DB-level CHECK constraint migration'da) */
    rating: smallint('rating').notNull(),
    comment: text('comment'),
    /** Yemek günü (Europe/Istanbul TZ üzerinden hesaplanır) */
    ate_on: date('ate_on').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userDayUnique: uniqueIndex('uq_meal_feedbacks_user_day').on(table.user_id, table.ate_on),
    orgDayIdx: index('idx_meal_feedbacks_org_day').on(table.org_id, table.ate_on),
    qrIdx: index('idx_meal_feedbacks_qr').on(table.kitchen_qr_id),
  }),
);

export type MealFeedback = typeof mealFeedbacks.$inferSelect;
export type NewMealFeedback = typeof mealFeedbacks.$inferInsert;
