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
 * xp_transactions — kullanıcının XP kazanma/harcama işlemlerinin denetlenebilir log'u.
 *
 * Her stamp / mood / streak milestone / haftalık ilk 3 ödülü / reward redeem buraya yazılır.
 * Toplama: SUM(amount) WHERE user_id=X AND created_at >= weekStart.
 *
 * source: 'check_in', 'check_in_on_time', 'check_in_full_trust', 'mood_logged',
 *         'streak_7', 'streak_30', 'streak_100', 'top3_weekly', 'top3_monthly',
 *         'redeem' (negatif), 'manual_admin' (admin manuel +/-)
 */
export const xpTransactions = pgTable(
  'xp_transactions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    /** Pozitif = kazanım, negatif = harcama */
    amount: integer('amount').notNull(),
    /** Açıklama (kullanıcıya gösterilir) */
    description: text('description'),
    /** Ref FK: ilgili event/leave/reward id'si */
    ref_id: uuid('ref_id'),
    ref_type: text('ref_type'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userTimeIdx: index('idx_xp_user_time').on(table.user_id, table.created_at),
    orgTimeIdx: index('idx_xp_org_time').on(table.org_id, table.created_at),
    sourceIdx: index('idx_xp_source').on(table.source),
  }),
);

export type XpTransaction = typeof xpTransactions.$inferSelect;
export type NewXpTransaction = typeof xpTransactions.$inferInsert;

/**
 * rewards — admin tanımlı ödüller (her org kendi ödüllerini koyar).
 *
 * Örnekler:
 *  - "Streak Shield": 1 günlük kaçırmaya karşı koruma (250 XP)
 *  - "Geç Gelme Hakkı (1 saat)": 300 XP
 *  - "Erken Çıkış (1 saat)": 400 XP
 *  - "Yemek seçim önceliği": 150 XP
 *  - "Park yeri (1 hafta)": 800 XP
 *  - "Gift card ₺100": 2000 XP (admin manuel takip)
 */
export const rewards = pgTable(
  'rewards',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    /** Emoji veya icon — UI'da görsel */
    icon: text('icon').default('🎁').notNull(),
    cost_xp: integer('cost_xp').notNull(),
    /** Stok limiti, null=sınırsız */
    stock: integer('stock'),
    /** Aynı kullanıcının kaç kez kullanabileceği (null=sınırsız) */
    per_user_limit: integer('per_user_limit'),
    is_active: boolean('is_active').notNull().default(true),
    created_by: uuid('created_by').references(() => users.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('idx_rewards_org').on(table.org_id),
  }),
);

export type Reward = typeof rewards.$inferSelect;
export type NewReward = typeof rewards.$inferInsert;

/**
 * user_redemptions — bir kullanıcının ödülü hangi tarihlerde aldığı.
 *
 * status: 'pending' (admin onayı bekliyor) | 'fulfilled' (verildi) | 'cancelled'
 */
export const userRedemptions = pgTable(
  'user_redemptions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reward_id: uuid('reward_id')
      .notNull()
      .references(() => rewards.id, { onDelete: 'restrict' }),
    cost_xp: integer('cost_xp').notNull(), // snapshot — reward sonradan değişse de bilirsin
    status: text('status', { enum: ['pending', 'fulfilled', 'cancelled'] })
      .notNull()
      .default('pending'),
    /** İlgili xp_transaction (negatif kayıt) */
    xp_transaction_id: uuid('xp_transaction_id'),
    fulfilled_by: uuid('fulfilled_by').references(() => users.id),
    fulfilled_at: timestamp('fulfilled_at', { withTimezone: true }),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('idx_redemptions_user').on(table.user_id),
    orgStatusIdx: index('idx_redemptions_org_status').on(table.org_id, table.status),
  }),
);

export type UserRedemption = typeof userRedemptions.$inferSelect;
export type NewUserRedemption = typeof userRedemptions.$inferInsert;
