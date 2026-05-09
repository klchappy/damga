import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { users } from './users';

/**
 * notifications — kullanıcıya gönderilen tetikli olaylar.
 *
 * Bell ikonunda gözükür, polling ile çekilir, browser permission varsa
 * ek olarak Notification API ile masaüstüne push edilir.
 *
 * type örnekleri:
 *  - 'leave_approved' / 'leave_rejected'
 *  - 'redemption_fulfilled' / 'redemption_cancelled'
 *  - 'top3_winner' (haftalık/aylık ilk 3)
 *  - 'overtime_approved' / 'overtime_rejected'
 *  - 'shift_assigned' (manager yeni vardiya atadı)
 *  - 'admin_announcement' (admin manuel)
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    /** Tıklanınca yönlendirilecek route (opsiyonel) */
    url: text('url'),
    /** Ek payload (rank, bonus, refId, vs.) */
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    is_read: boolean('is_read').notNull().default(false),
    read_at: timestamp('read_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userUnreadIdx: index('idx_notifications_user_unread').on(table.user_id, table.is_read),
    userTimeIdx: index('idx_notifications_user_time').on(table.user_id, table.created_at),
  }),
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

/**
 * push_subscriptions — Web Push API endpoint kayıtları.
 *
 * Browser permission verildikten sonra serviceWorker.pushManager.subscribe()
 * sonucu buraya kaydedilir. createNotification çağrılınca tüm aktif
 * subscription'lara web-push ile gönderilir.
 *
 * Aynı kullanıcının birden fazla cihazı (telefon + masaüstü) olabilir.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    /** PushSubscription.keys.p256dh */
    p256dh: text('p256dh').notNull(),
    /** PushSubscription.keys.auth */
    auth: text('auth').notNull(),
    user_agent: text('user_agent'),
    is_active: boolean('is_active').notNull().default(true),
    last_used_at: timestamp('last_used_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('idx_push_subs_user').on(table.user_id, table.is_active),
  }),
);

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
