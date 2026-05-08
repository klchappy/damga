import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { users } from './users';

/**
 * locations — şirketin fiziksel mekanları (ofis, şantiye, mağaza).
 * Check-in için geofence + WiFi BSSID + NFC tag whitelist'i tutar.
 */
export const locations = pgTable(
  'locations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(), // "Merkez Ofis"
    address: text('address'),
    city: text('city'),
    timezone: text('timezone').notNull().default('Europe/Istanbul'),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    /** Geofence yarıçapı (metre). Bu mesafe içindeki check-in trust score alır. */
    geofence_radius_m: integer('geofence_radius_m').notNull().default(100),
    /** İzinli WiFi MAC adresleri (BSSID) */
    wifi_bssids: text('wifi_bssids').array().notNull().default(sql`'{}'::text[]`),
    /** İzinli NFC tag id'leri (URI hash veya tag UID) */
    nfc_tag_ids: text('nfc_tag_ids').array().notNull().default(sql`'{}'::text[]`),
    /** İzinli QR kod payload'ları (HMAC ile imzalı) */
    qr_codes: text('qr_codes').array().notNull().default(sql`'{}'::text[]`),
    work_hours_start: text('work_hours_start').notNull().default('09:00'),
    work_hours_end: text('work_hours_end').notNull().default('18:00'),
    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('idx_locations_org').on(table.org_id),
  }),
);

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;

/**
 * location_nfc_tags — bir lokasyona ait NFC tag'lerin TÜM bilgileri.
 * Eski `locations.nfc_tag_ids` whitelist'i sürekliliği için tutuluyor;
 * burada label, payload, oluşturulma tarihi vb. metadata var → admin
 * tag'ı sonradan tekrar görüntüleyebiliyor / NFC Tools'a yazabiliyor.
 */
export const locationNfcTags = pgTable(
  'location_nfc_tags',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    location_id: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    /** NFC tag id (nfc_xxx) — checkin sırasında payload'tan parse edilir */
    tag_id: text('tag_id').notNull(),
    label: text('label'),
    /** HMAC-imzalı NFC payload string'i */
    payload: text('payload').notNull(),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    last_used_at: timestamp('last_used_at', { withTimezone: true }),
    is_active: boolean('is_active').notNull().default(true),
  },
  (table) => ({
    locationIdx: index('idx_nfc_tags_location').on(table.location_id),
    tagIdIdx: index('idx_nfc_tags_tag_id').on(table.tag_id),
  }),
);

export type LocationNfcTag = typeof locationNfcTags.$inferSelect;
export type NewLocationNfcTag = typeof locationNfcTags.$inferInsert;

/**
 * location_qr_codes — bir lokasyona ait QR kodların TÜM bilgileri.
 * Eski `locations.qr_codes` array'i de payload sürekliliği için tutuluyor.
 */
export const locationQrCodes = pgTable(
  'location_qr_codes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    location_id: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    label: text('label'),
    /** HMAC-imzalı QR payload (v1|loc_id|issued|expires|nonce|hmac) */
    payload: text('payload').notNull(),
    ttl_days: integer('ttl_days').notNull().default(90),
    expires_at: timestamp('expires_at', { withTimezone: true }),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    last_used_at: timestamp('last_used_at', { withTimezone: true }),
    is_active: boolean('is_active').notNull().default(true),
  },
  (table) => ({
    locationIdx: index('idx_qr_codes_location').on(table.location_id),
  }),
);

export type LocationQrCode = typeof locationQrCodes.$inferSelect;
export type NewLocationQrCode = typeof locationQrCodes.$inferInsert;
