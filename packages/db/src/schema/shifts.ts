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
import { orgs } from './orgs';
import { users } from './users';
import { locations } from './locations';
import { attendanceEvents } from './attendance-events';

/**
 * shift_templates — bir lokasyonun olası vardiya tanımları.
 *
 * Örnek: "Sabah" 09:00-18:00, "Akşam" 14:00-23:00, "Gece" 22:00-07:00.
 * Bir lokasyonun birden fazla şablonu olabilir; manager bunları
 * `shift_assignments` tablosuyla kullanıcılara tarihler boyunca atar.
 */
export const shiftTemplates = pgTable(
  'shift_templates',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    /** Vardiya hangi lokasyona ait? null = tüm lokasyonlar (genel şablon) */
    location_id: uuid('location_id').references(() => locations.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(), // "Sabah Vardiyası", "Gece"
    start_time: text('start_time').notNull(), // 'HH:MM'
    end_time: text('end_time').notNull(), // 'HH:MM' — < start ise gece vardiyası (ertesi gün)
    /** Ücretsiz mola süresi (dakika) — overtime hesabında düşülür */
    break_minutes: integer('break_minutes').notNull().default(60),
    /** UI için renk (#hex) — takvimde ayrım yaratır */
    color: text('color').notNull().default('#f97316'),
    /** Bu vardiya geçen sürede +1 dakikadan fazla mesai sayılsın mı? */
    overtime_threshold_minutes: integer('overtime_threshold_minutes').notNull().default(15),
    is_active: boolean('is_active').notNull().default(true),
    created_by: uuid('created_by').references(() => users.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('idx_shift_templates_org').on(table.org_id),
    locIdx: index('idx_shift_templates_location').on(table.location_id),
  }),
);

export type ShiftTemplate = typeof shiftTemplates.$inferSelect;
export type NewShiftTemplate = typeof shiftTemplates.$inferInsert;

/**
 * shift_assignments — bir kullanıcının bir tarihte hangi vardiyada olduğu.
 *
 * Manager haftalık planda doldurur; kullanıcı kendi sayfasından görür.
 * Aynı user için aynı tarihte birden fazla satır olmamalı (UNIQUE constraint).
 */
export const shiftAssignments = pgTable(
  'shift_assignments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    shift_template_id: uuid('shift_template_id')
      .notNull()
      .references(() => shiftTemplates.id, { onDelete: 'restrict' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Vardiyanın tarihi (YYYY-MM-DD) */
    shift_date: date('shift_date').notNull(),
    /** Override: bazen şablonu değil tek seferlik saatleri kullan */
    override_start: text('override_start'),
    override_end: text('override_end'),
    status: text('status', {
      enum: ['scheduled', 'completed', 'absent', 'swapped'],
    })
      .notNull()
      .default('scheduled'),
    notes: text('notes'),
    created_by: uuid('created_by').references(() => users.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgDateIdx: index('idx_shift_assignments_org_date').on(table.org_id, table.shift_date),
    userDateIdx: index('idx_shift_assignments_user_date').on(table.user_id, table.shift_date),
    // Unique: bir kullanıcının aynı günde tek vardiyası olur
    userDateUnq: index('uq_shift_assignments_user_date')
      .on(table.user_id, table.shift_date)
      .where(sql`status <> 'swapped'`),
  }),
);

export type ShiftAssignment = typeof shiftAssignments.$inferSelect;
export type NewShiftAssignment = typeof shiftAssignments.$inferInsert;

/**
 * overtime_records — kullanıcının fazla mesai kayıtları.
 *
 * `attendance-events.check_out` insert edildiğinde, kullanıcının o günkü
 * shift_assignment'ına bakarak otomatik oluşturulur:
 *   - Beklenen çıkış saati = shift_template.end_time (override varsa o)
 *   - Gerçek çıkış − beklenen > overtime_threshold_minutes ise kayıt
 *   - status = 'pending' (admin/manager onaylar)
 *
 * Onaylanırsa: optional XP bonusu + raporlara dahil edilir.
 */
export const overtimeRecords = pgTable(
  'overtime_records',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    shift_assignment_id: uuid('shift_assignment_id').references(() => shiftAssignments.id, {
      onDelete: 'set null',
    }),
    /** Tetikleyen check_out event'i */
    event_id: uuid('event_id').references(() => attendanceEvents.id, {
      onDelete: 'set null',
    }),
    /** Hesaplanan fazla mesai (dakika) */
    overtime_minutes: integer('overtime_minutes').notNull(),
    /** Beklenen çıkış (HH:MM) — snapshot */
    expected_end: text('expected_end').notNull(),
    /** Gerçek çıkış zamanı (server time) */
    actual_end: timestamp('actual_end', { withTimezone: true }).notNull(),
    /** Çalışan/manager açıklaması */
    reason: text('reason'),
    status: text('status', {
      enum: ['pending', 'approved', 'rejected'],
    })
      .notNull()
      .default('pending'),
    approved_by: uuid('approved_by').references(() => users.id),
    approved_at: timestamp('approved_at', { withTimezone: true }),
    /** Onay sırasında verilen XP bonusu (varsa) */
    xp_transaction_id: uuid('xp_transaction_id'),
    rejection_reason: text('rejection_reason'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgStatusIdx: index('idx_overtime_org_status').on(table.org_id, table.status),
    userTimeIdx: index('idx_overtime_user_time').on(table.user_id, table.created_at),
  }),
);

export type OvertimeRecord = typeof overtimeRecords.$inferSelect;
export type NewOvertimeRecord = typeof overtimeRecords.$inferInsert;
