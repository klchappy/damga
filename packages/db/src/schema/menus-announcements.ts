import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { announcementCategoryEnum } from './enums';
import { orgs } from './orgs';
import { users } from './users';
import { locations } from './locations';

/**
 * menus — günlük yemek menüsü (yöneticinin yayınladığı).
 */
export const menus = pgTable(
  'menus',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    location_id: uuid('location_id').references(() => locations.id, {
      onDelete: 'set null',
    }),
    date: date('date').notNull(),
    main_dish: text('main_dish').notNull(),
    description: text('description'),
    photo_url: text('photo_url'),
    calories: integer('calories'),
    /** ['gluten', 'lactose', 'nuts', 'shellfish', 'egg'] */
    allergens: text('allergens').array().notNull().default(sql`'{}'::text[]`),
    is_vegetarian: boolean('is_vegetarian').notNull().default(false),
    is_vegan: boolean('is_vegan').notNull().default(false),
    created_by: uuid('created_by').references(() => users.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgDateIdx: index('idx_menus_org_date').on(table.org_id, table.date),
  }),
);

export type Menu = typeof menus.$inferSelect;
export type NewMenu = typeof menus.$inferInsert;

/**
 * menu_rsvps — çalışanların menüye RSVP'si + yıldız puanı + yorum.
 *
 * Mutfaktaki QR kodu ile gelen kullanıcı buradaki rating + comment'i doldurur.
 * Composite PK (menu_id + user_id) — kişi başına menü başına 1 kayıt; yeni
 * yorum veya puan upsert eder.
 */
export const menuRsvps = pgTable(
  'menu_rsvps',
  {
    menu_id: uuid('menu_id')
      .notNull()
      .references(() => menus.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    will_eat: boolean('will_eat').notNull().default(true),
    rating: integer('rating'), // 1-5 yıldız (yedikten sonra)
    /** Çalışanın yemek yorumu — mutfak QR'ından girilir, max 500 char */
    comment: text('comment'),
    /** Yorum/puan ne zaman güncellendi (rsvp ilk eklenmesinden ayrı) */
    feedback_at: timestamp('feedback_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.menu_id, table.user_id] }),
  }),
);

export type MenuRsvp = typeof menuRsvps.$inferSelect;

/**
 * announcements — şirket içi duyuru.
 */
export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    category: announcementCategoryEnum('category').notNull().default('info'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** null = tüm org. Bir liste ise sadece o user'lar görür. */
    target_user_ids: uuid('target_user_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    pinned: boolean('pinned').notNull().default(false),
    created_by: uuid('created_by').references(() => users.id),
    expires_at: timestamp('expires_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('idx_announcements_org').on(table.org_id),
    pinnedIdx: index('idx_announcements_pinned').on(table.pinned),
  }),
);

export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;

export const announcementReads = pgTable(
  'announcement_reads',
  {
    announcement_id: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    read_at: timestamp('read_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.announcement_id, table.user_id] }),
  }),
);

export type AnnouncementRead = typeof announcementReads.$inferSelect;
