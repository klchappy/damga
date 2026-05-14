import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { leaveStatusEnum, leaveTypeEnum } from './enums';
import { orgs } from './orgs';
import { users } from './users';

/**
 * leaves — izin yönetimi (yıllık, hastalık, ücretsiz...).
 * pending → approved/rejected akışı.
 */
export const leaves = pgTable(
  'leaves',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: leaveTypeEnum('type').notNull(),
    start_date: date('start_date').notNull(),
    end_date: date('end_date').notNull(),
    half_day: boolean('half_day').notNull().default(false),
    reason: text('reason'),
    status: leaveStatusEnum('status').notNull().default('pending'),
    approved_by: uuid('approved_by').references(() => users.id),
    approved_at: timestamp('approved_at', { withTimezone: true }),
    rejection_reason: text('rejection_reason'),
    /** Hesaplanan iş günü sayısı (hafta sonu hariç). Server hesaplar. */
    business_days: integer('business_days'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('idx_leaves_user').on(table.user_id),
    statusIdx: index('idx_leaves_status').on(table.status),
    dateRangeIdx: index('idx_leaves_date_range').on(table.start_date, table.end_date),
  }),
);

export type Leave = typeof leaves.$inferSelect;
export type NewLeave = typeof leaves.$inferInsert;
