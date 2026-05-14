import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { users } from './users';

/**
 * user_stamp_credentials — Her kullanıcının kendine ait fiziksel QR/NFC kimliği.
 *
 * Multi-user kiosk senaryosu: Lokasyonda tek bir tablet, manager logged-in.
 * Her çalışan KENDİ QR badge'ini (basılı kart) tablete gösterir → o kullanıcı
 * adına check-in/out kaydı düşer.
 *
 * Lokasyon QR/NFC'leri (`location_*`) "BURASI HANGİ ŞUBE" sorusunu cevaplar.
 * Kullanıcı QR/NFC'leri ise "BU KİM" sorusunu cevaplar.
 *
 * credential_value:
 *   - QR ise: rasgele 32 char base32 string (kart üstüne basılır)
 *   - NFC ise: NFC tag id veya kişisel hex string
 *
 * Güvenlik:
 *   - credential_value tek seferlik üretilir, sadece kullanıcı görür
 *   - HMAC ile imzalanır (NFC_SIGNING_SECRET kullanılır)
 *   - is_active=false ise damga reddedilir (kart kaybolursa revoke)
 *
 * Kullanım:
 *   - POST /v1/me/stamp-credentials/generate → yeni kart üret, eskisini revoke et
 *   - POST /v1/kiosk-stamp → kiosk endpoint, credential_value ile kullanıcı bulur
 */
export const userStampCredentials = pgTable(
  'user_stamp_credentials',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'qr' | 'nfc' */
    credential_type: text('credential_type').notNull(),
    /**
     * Credential'ın deterministik prefix'i (lookup için index).
     * Tam değer credential_value_hash'te.
     */
    credential_prefix: text('credential_prefix').notNull(),
    /**
     * Credential'ın bcrypt hash'i — lookup için prefix ile match, sonra bcrypt.compare.
     * (API key pattern'i ile aynı — db'de düz değer tutulmaz, çalınsa bile geri çevrilemez)
     */
    credential_value_hash: text('credential_value_hash').notNull(),
    /** Kullanıcının verdiği etiket: "Cüzdandaki kart", "Yedek kart", vs. */
    label: text('label'),
    is_active: boolean('is_active').notNull().default(true),
    /** Son kullanım — kayıp/kullanılmayan kartları temizlemek için */
    last_used_at: timestamp('last_used_at', { withTimezone: true }),
    /** Revoke edildi mi (kart kayboldu/kullanıcı değiştirdi) */
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('idx_stamp_creds_org').on(table.org_id),
    userIdx: index('idx_stamp_creds_user').on(table.user_id),
    // Prefix ile lookup (kiosk-stamp endpoint'i bunun üzerinden bcrypt.compare yapacak)
    prefixIdx: index('idx_stamp_creds_prefix').on(table.credential_prefix),
    // Bir kullanıcının aynı prefix ile birden fazla credential'ı OLMAMALI
    uniqPrefix: uniqueIndex('uniq_stamp_creds_prefix').on(table.credential_prefix),
  }),
);

export type UserStampCredential = typeof userStampCredentials.$inferSelect;
export type NewUserStampCredential = typeof userStampCredentials.$inferInsert;
