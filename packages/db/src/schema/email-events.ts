import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

/**
 * email_events — Resend webhook'larından gelen email teslimat olayları.
 *
 * Resend her gönderdiği email için şu event'leri webhook olarak push eder:
 *   - email.sent     — Resend'e gönderildi
 *   - email.delivered — Recipient inbox'una düştü
 *   - email.bounced   — Bounce (hard veya soft)
 *   - email.complained — Spam şikâyeti
 *   - email.opened    — Email açıldı (tracking aktifse)
 *   - email.clicked   — Link tıklandı (tracking aktifse)
 *
 * Saklama: 90 gün (KVKK + analiz dengesi). Cron temizler.
 *
 * Kullanım:
 *   - Bounce rate > %5 → Resend hesabı suspend riski, alarm
 *   - Spam complaint > %0.1 → CRITICAL alarm
 *   - Platform admin paneli → email teslimat sağlığı dashboard
 */
export const emailEvents = pgTable(
  'email_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** Resend'den gelen event_id (idempotency için unique) */
    resend_event_id: text('resend_event_id').notNull().unique(),
    /** email.sent, email.delivered, email.bounced, vb. */
    event_type: text('event_type').notNull(),
    /** Resend'in mail id'si — birden fazla event aynı email için */
    resend_email_id: text('resend_email_id'),
    from_email: text('from_email'),
    to_email: text('to_email'),
    subject: text('subject'),
    /** Bounce/complaint detayı varsa */
    bounce_type: text('bounce_type'),
    bounce_reason: text('bounce_reason'),
    /** Hangi org'un email'i (tag/header üzerinden çıkarılabiliyorsa) */
    org_id: uuid('org_id').references(() => orgs.id, { onDelete: 'set null' }),
    /** Tüm raw payload — debugging için */
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
    /** Resend'in olay zamanı (webhook delay'i hesaba katmak için) */
    occurred_at: timestamp('occurred_at', { withTimezone: true }),
    received_at: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    typeIdx: index('idx_email_events_type').on(table.event_type, table.received_at),
    toIdx: index('idx_email_events_to').on(table.to_email),
    orgIdx: index('idx_email_events_org').on(table.org_id, table.received_at),
  }),
);

export type EmailEvent = typeof emailEvents.$inferSelect;
export type NewEmailEvent = typeof emailEvents.$inferInsert;
