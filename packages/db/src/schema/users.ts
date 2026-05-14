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
import { userRoleEnum } from './enums';
import { orgs } from './orgs';

/**
 * users — Damga kullanıcıları (çalışan, yönetici, admin, owner).
 * Supabase Auth ile bağlantı: `auth_user_id` Supabase'in user.id'si.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
    /** Supabase auth.users.id ile eşleşir */
    auth_user_id: uuid('auth_user_id').unique(),
    email: text('email').notNull().unique(),
    /** Kullanıcı adı — sign-in'de email yerine kullanılabilir (case-insensitive lookup) */
    username: text('username').unique(),
    /** Telefon (E.164 formatı: +905xx...) — sign-in'de email yerine kullanılabilir, SMS/WhatsApp için adres */
    phone: text('phone').unique(),
    full_name: text('full_name').notNull(),
    avatar_url: text('avatar_url'),
    role: userRoleEnum('role').notNull().default('employee'),
    department: text('department'),
    title: text('title'), // ör. "Yazılım Geliştirici"
    hired_at: date('hired_at'),
    is_active: boolean('is_active').notNull().default(true),
    /** Admin onayı bekleyen kayıt mı? (org_id atanmadan giriş yapamaz) */
    is_pending: boolean('is_pending').notNull().default(false),
    /** Kayıtlı device id'leri (mobil cihaz tanıma) */
    device_ids: text('device_ids').array().notNull().default(sql`'{}'::text[]`),
    /** Çalışanın yıllık izin kotası (gün) */
    annual_leave_quota_days: integer('annual_leave_quota_days').notNull().default(14),
    /** Bu yıl kullanılan yıllık izin (cron ile yıl başında sıfırlanır) */
    annual_leave_used_days: integer('annual_leave_used_days').notNull().default(0),
    // Gamification
    current_streak: integer('current_streak').notNull().default(0),
    longest_streak: integer('longest_streak').notNull().default(0),
    total_xp: integer('total_xp').notNull().default(0),
    level: integer('level').notNull().default(1),
    /** Streak Shield stoğu (gamification) */
    shields: integer('shields').notNull().default(0),
    last_login_at: timestamp('last_login_at', { withTimezone: true }),
    /** KVKK md.11: kullanıcı hesabını silme talebinde bulundu */
    deletion_requested_at: timestamp('deletion_requested_at', { withTimezone: true }),
    /** Otomatik anonymize tarihi (talep + 30 gün) — bu tarihten önce geri alabilir */
    deletion_scheduled_at: timestamp('deletion_scheduled_at', { withTimezone: true }),
    /** Kullanıcının silme nedeni (opsiyonel feedback) */
    deletion_reason: text('deletion_reason'),
    /** Anonymize edildiği tarih (full_name='[Silinmiş]' vs olduğunda doldurulur) */
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('idx_users_org').on(table.org_id),
    authIdx: index('idx_users_auth').on(table.auth_user_id),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
