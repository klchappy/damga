import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { users } from './users';

/**
 * api_keys — public API entegrasyonları için (örn. TahminIO sync).
 * key_hash bcrypt ile saklanır; raw key sadece oluşturma anında kullanıcıya gösterilir.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** bcrypt hash */
    key_hash: text('key_hash').notNull(),
    /** Raw key'in görünen kısmı (UI'da: "dmg_live_xxxx****") */
    key_prefix: text('key_prefix').notNull(),
    /** Scope listesi: ['events:read', 'events:write', 'leaves:read', ...] */
    scopes: text('scopes').array().notNull(),
    rate_limit_per_min: integer('rate_limit_per_min').notNull().default(100),
    last_used_at: timestamp('last_used_at', { withTimezone: true }),
    expires_at: timestamp('expires_at', { withTimezone: true }),
    created_by: uuid('created_by').references(() => users.id),
    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('idx_api_keys_org').on(table.org_id),
    prefixIdx: index('idx_api_keys_prefix').on(table.key_prefix),
  }),
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

/**
 * webhooks — outbound webhook konfigürasyonları.
 */
export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    events: text('events').array().notNull(), // ['check_in.created', ...]
    secret: text('secret').notNull(), // HMAC imzalama için
    is_active: boolean('is_active').notNull().default(true),
    failure_count: integer('failure_count').notNull().default(0),
    last_failure_at: timestamp('last_failure_at', { withTimezone: true }),
    last_failure_reason: text('last_failure_reason'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('idx_webhooks_org').on(table.org_id),
  }),
);

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;

/**
 * webhook_deliveries — son N teslimatın logu (UI'da göstermek + retry için).
 */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    webhook_id: uuid('webhook_id')
      .notNull()
      .references(() => webhooks.id, { onDelete: 'cascade' }),
    event_type: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    response_status: integer('response_status'),
    response_body: text('response_body'),
    attempts: integer('attempts').notNull().default(1),
    delivered_at: timestamp('delivered_at', { withTimezone: true }),
    failed_at: timestamp('failed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    webhookIdx: index('idx_deliveries_webhook').on(table.webhook_id),
    createdIdx: index('idx_deliveries_created').on(table.created_at),
  }),
);

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;

/**
 * audit_log — admin/manager işlemlerinin denetim izi.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
    actor_user_id: uuid('actor_user_id').references(() => users.id),
    action: text('action').notNull(),
    target_type: text('target_type'),
    target_id: text('target_id'),
    details: jsonb('details'),
    ip_address: text('ip_address'),
    user_agent: text('user_agent'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('idx_audit_org').on(table.org_id),
    actionIdx: index('idx_audit_action').on(table.action),
    createdIdx: index('idx_audit_created').on(table.created_at),
  }),
);

export type AuditLog = typeof auditLog.$inferSelect;
