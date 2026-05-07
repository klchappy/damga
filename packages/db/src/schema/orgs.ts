import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { planEnum } from './enums';
import type { OrgSettings } from '../types';

/**
 * orgs — multitenancy birimi (şirket / takım).
 */
export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: planEnum('plan').notNull().default('free'),
  /** KVKK aydınlatma metni — şirketin imzaladığı, çalışanlara gösterilen */
  kvkk_consent_text: text('kvkk_consent_text'),
  settings: jsonb('settings').$type<OrgSettings>().default({}).notNull(),
  trial_ends_at: timestamp('trial_ends_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;
