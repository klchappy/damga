import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { users } from './users';

/**
 * api_key_type:
 *   - 'org_admin': org owner üretir, sadece kendi org'una erişir (mevcut akış, default)
 *   - 'service': platform admin (Kaan) üretir, tüm org'lara erişir;
 *     her istekte ?org_id=xxx query param ZORUNLU, prefix `dmg_svc_*`
 */
export const apiKeyTypeEnum = pgEnum('api_key_type', ['org_admin', 'service']);

/**
 * api_keys — entegrasyon (org-bağlı admin key'leri) ve servis-arası iletişim
 * (org-bağımsız service key'ler) için.
 *
 * key_hash bcrypt ile saklanır; raw key sadece oluşturma anında kullanıcıya gösterilir.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** NULL ise service key (org-bağımsız); aksi halde org owner key'i */
    org_id: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
    key_type: apiKeyTypeEnum('key_type').notNull().default('org_admin'),
    name: text('name').notNull(),
    /** bcrypt hash */
    key_hash: text('key_hash').notNull(),
    /** Raw key'in görünen kısmı (UI'da: "dmg_live_xxxx****" / "dmg_svc_xxxx****") */
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
    typeIdx: index('idx_api_keys_type').on(table.key_type),
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
 * external_integrations — Damga'nın dış servisleri kullanması için saklanan bağlantılar.
 * Örn: AI API, muhasebe, bordro, özel HTTP servisleri. Secret alanlar şifrelenmiş
 * JSON içinde tutulur ve API yanıtlarında raw değer olarak dönmez.
 */
export const externalIntegrations = pgTable(
  'external_integrations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    service_type: text('service_type').notNull(),
    name: text('name').notNull(),
    base_url: text('base_url'),
    docs_url: text('docs_url'),
    config: jsonb('config').notNull().default(sql`'{}'::jsonb`),
    encrypted_secrets: jsonb('encrypted_secrets').notNull().default(sql`'{}'::jsonb`),
    secret_fields: text('secret_fields').array().notNull().default(sql`ARRAY[]::text[]`),
    is_active: boolean('is_active').notNull().default(true),
    created_by: uuid('created_by').references(() => users.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('idx_external_integrations_org').on(table.org_id),
    typeIdx: index('idx_external_integrations_type').on(table.service_type),
  }),
);

export type ExternalIntegration = typeof externalIntegrations.$inferSelect;
export type NewExternalIntegration = typeof externalIntegrations.$inferInsert;

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

/**
 * idempotency_keys — POST/PUT/PATCH/DELETE retry'larin guvenli tekrar islemesi.
 * Client `Idempotency-Key: <uuid>` header gonderir. Ayni key + method + path
 * ile gelen tekrar istek cached response doner (request body hash uyusursa).
 * TTL: 24 saat (cleanup cron veya rolling delete).
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    key: text('key').notNull(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    /** SHA256(JSON.stringify(req.body)) — body uyusmaz ise 422 */
    request_hash: text('request_hash').notNull(),
    response_status: integer('response_status'),
    response_body: jsonb('response_body'),
    org_id: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
    api_key_id: uuid('api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    keyMethodPathIdx: uniqueIndex('idx_idempotency_key_method_path').on(
      table.key,
      table.method,
      table.path,
    ),
    createdIdx: index('idx_idempotency_created').on(table.created_at),
  }),
);

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
