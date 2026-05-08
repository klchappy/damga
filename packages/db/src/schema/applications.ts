import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * organization_applications — yeni şirket başvurusu (Damga'ya org açma talebi).
 *
 * Akış:
 *   1) Anonim kullanıcı /auth/apply-org → bu tabloya 'pending' status ile kayıt
 *   2) Sistem admini (root team) /admin/applications üzerinden onaylar
 *   3) Onay → orgs + users (owner) + departments (4 default) seed edilir
 *      + başvurucuya magic link gönderilir
 */
export const organizationApplications = pgTable(
  'organization_applications',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** Şirket bilgileri */
    org_name: text('org_name').notNull(),
    tax_id: text('tax_id'), // Vergi numarası (opsiyonel)
    industry: text('industry'), // sektör — "tekstil", "yazılım", vs.
    employee_count_estimate: text('employee_count_estimate'), // "1-10" / "11-50" / "51-200" / "200+"

    /** Başvurucu (firma sahibi / yetkili) */
    applicant_full_name: text('applicant_full_name').notNull(),
    applicant_email: text('applicant_email').notNull(),
    applicant_phone: text('applicant_phone'),
    applicant_title: text('applicant_title'), // "Yönetici", "İK Müdürü", vs.

    /** Başvuru detayı / not */
    notes: text('notes'),

    /** Akış durumu */
    status: text('status', {
      enum: ['pending', 'approved', 'rejected'],
    }).notNull().default('pending'),
    rejection_reason: text('rejection_reason'),

    /** Onay sonrası oluşan org_id */
    created_org_id: uuid('created_org_id'),
    /** Onay sonrası oluşan user_id (owner) */
    created_user_id: uuid('created_user_id'),

    /** Admin işlemi */
    reviewed_by_user_id: uuid('reviewed_by_user_id'),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),

    /** İletişim metadata */
    ip_address: text('ip_address'),
    user_agent: text('user_agent'),
    metadata: jsonb('metadata'),

    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index('idx_org_app_status').on(table.status),
    emailIdx: index('idx_org_app_email').on(table.applicant_email),
  }),
);

export type OrganizationApplication = typeof organizationApplications.$inferSelect;
export type NewOrganizationApplication = typeof organizationApplications.$inferInsert;
