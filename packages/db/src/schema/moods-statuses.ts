import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { statusTypeEnum } from './enums';
import { orgs } from './orgs';
import { users } from './users';

/**
 * moods — günlük mood damgası (1 emoji).
 * KVKK: özel nitelikli sağlık verisi → ek açık rıza şart.
 */
export const moods = pgTable(
  'moods',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Emoji string (😄/🙂/😐/😕/😫) */
    emoji: text('emoji').notNull(),
    /** 1-5 arası numerik karşılığı (rapor için) */
    score: integer('score').notNull(),
    date: date('date').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueDate: uniqueIndex('idx_mood_user_date').on(table.user_id, table.date),
    orgDateIdx: index('idx_mood_org_date').on(table.org_id, table.date),
  }),
);

export type Mood = typeof moods.$inferSelect;
export type NewMood = typeof moods.$inferInsert;

/**
 * statuses — çalışanın o anki çalışma durumu (yöneticiye yayın).
 * Auto-expire: gün sonunda silinir.
 */
export const statuses = pgTable(
  'statuses',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status_type: statusTypeEnum('status_type').notNull(),
    note: text('note'),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('idx_status_user').on(table.user_id),
    orgIdx: index('idx_status_org').on(table.org_id),
  }),
);

export type Status = typeof statuses.$inferSelect;
export type NewStatus = typeof statuses.$inferInsert;
