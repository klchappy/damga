import { sql } from 'drizzle-orm';
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { attendanceEventTypeEnum } from './enums';
import { orgs } from './orgs';
import { users } from './users';
import { locations } from './locations';
import type { DeviceInfo } from '../types';

/**
 * attendance_events — KRİTİK MİMARİ:
 *   - Append-only: UPDATE/DELETE migration'da REVOKE edilir
 *   - Hash chain: her event önceki event'in hash'ini içerir (PostgreSQL trigger)
 *   - Düzeltmeler `supersedes_event_id` ile yeni event olarak eklenir
 *
 * Hash chain doğrulaması ile veritabanı manipülasyonu tespit edilebilir.
 */
export const attendanceEvents = pgTable(
  'attendance_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'restrict' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    type: attendanceEventTypeEnum('type').notNull(),

    // ===== Zaman alanları =====
    /** İstemcinin gönderdiği zaman (anomali tespiti için) */
    client_time: timestamp('client_time', { withTimezone: true }).notNull(),
    /** Sunucunun event'i kaydettiği zaman (TEK DOĞRU) */
    server_time: timestamp('server_time', { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** Effective time = düzeltme sonrası geçerli zaman (admin_correction için) */
    effective_time: timestamp('effective_time', { withTimezone: true }).notNull(),
    timezone_at_time: text('timezone_at_time').notNull().default('Europe/Istanbul'),

    // ===== Konum =====
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    gps_accuracy_m: integer('gps_accuracy_m'),
    location_id: uuid('location_id').references(() => locations.id),
    /** Geofence merkezine olan mesafe (metre) */
    distance_from_office_m: integer('distance_from_office_m'),

    // ===== Doğrulama kanıtları =====
    nfc_tag_id: text('nfc_tag_id'),
    /** NFC tag'taki HMAC imzası (replay attack koruması) */
    nfc_signature: text('nfc_signature'),
    qr_code_payload: text('qr_code_payload'),
    wifi_bssid: text('wifi_bssid'),
    device_id: text('device_id'),
    /** IP — son 2 oktet maskelenmiş (KVKK) */
    ip_address: text('ip_address'),
    user_agent: text('user_agent'),
    /** Hangi yöntemler doğrulandı: ['nfc', 'gps', 'wifi', 'time', 'device'] */
    verification_methods: text('verification_methods')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** 0–100 arası trust score */
    verification_score: integer('verification_score').notNull(),
    /** Tüm input'ların SHA-256 hash'i (delillerin değişmediğini ispatlar) */
    evidence_hash: text('evidence_hash').notNull(),

    // ===== Bütünlük (Hash Chain) =====
    /** Aynı org_id'nin ÖNCEKİ event'inin this_event_hash'i */
    previous_event_hash: text('previous_event_hash'),
    /** Bu event'in hash'i (trigger ile hesaplanır) */
    this_event_hash: text('this_event_hash').notNull(),
    /** Düzeltme ise hangi event'in yerini aldığı */
    supersedes_event_id: uuid('supersedes_event_id'),
    edit_reason: text('edit_reason'),
    edited_by_user_id: uuid('edited_by_user_id').references(() => users.id),

    // ===== Meta =====
    app_version: text('app_version'),
    device_info: jsonb('device_info').$type<DeviceInfo>(),
    /** Anomali bayrakları: ['late_sync', 'duplicate', 'low_trust', 'time_drift', ...] */
    flags: text('flags').array().notNull().default(sql`'{}'::text[]`),

    // ===== Manuel inceleme (anomali → selfie + yönetici onayı) =====
    /**
     * 'approved'         → otomatik kabul edildi (varsayılan, geriye uyumlu)
     * 'pending_review'   → anomali tespit edildi + selfie yüklendi, yönetici onayı bekleniyor
     * 'rejected'         → yönetici reddetti (event tutulur ama "geçersiz")
     */
    review_status: text('review_status', {
      enum: ['approved', 'pending_review', 'rejected'],
    })
      .notNull()
      .default('approved'),
    /** Selfie fotoğraf URL (Supabase Storage public URL) */
    selfie_url: text('selfie_url'),
    /** Anomali sebepleri: ['no_gps', 'out_of_geofence', 'unknown_device', 'low_gps_accuracy', 'no_wifi'] */
    review_reasons: text('review_reasons').array().notNull().default(sql`'{}'::text[]`),
    /** İncelemeyi yapan yönetici (manager/admin/owner) */
    reviewed_by_user_id: uuid('reviewed_by_user_id').references(() => users.id),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
    /** Yöneticinin onay/red gerekçesi (opsiyonel) */
    review_notes: text('review_notes'),

    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgUserTimeIdx: index('idx_events_org_user_time').on(
      table.org_id,
      table.user_id,
      table.server_time,
    ),
    hashChainIdx: index('idx_events_hash').on(table.this_event_hash),
    typeIdx: index('idx_events_type').on(table.type),
    locationIdx: index('idx_events_location').on(table.location_id),
    reviewStatusIdx: index('idx_events_review_status').on(
      table.org_id,
      table.review_status,
    ),
  }),
);

export type AttendanceEvent = typeof attendanceEvents.$inferSelect;
export type NewAttendanceEvent = typeof attendanceEvents.$inferInsert;
