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
