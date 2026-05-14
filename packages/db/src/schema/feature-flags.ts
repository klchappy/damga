import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * feature_flags — gated rollout için basit in-app feature flag sistemi.
 *
 * GrowthBook/Unleash/LaunchDarkly yerine kendi minimum implementasyonumuz.
 * 10-20 flag'e kadar yeterli; daha fazla olursa GrowthBook'a geç.
 *
 * Targeting:
 *   - enabled = false → herkese kapalı (default)
 *   - enabled = true → herkese açık
 *   - enabled = true + rules.orgs = [...] → sadece belirli org'lara
 *   - enabled = true + rules.percentage = 25 → kullanıcıların %25'ine
 *   - enabled = true + rules.plans = ['pro', 'business'] → sadece bu planlar
 *
 * Kullanım API'de:
 *   const enabled = await isFeatureEnabled('new_dashboard', { orgId, plan });
 *
 * Frontend'de:
 *   const enabled = useFeatureFlag('new_dashboard');
 */
export const featureFlags = pgTable(
  'feature_flags',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** Flag key (snake_case): 'new_dashboard', 'sms_2fa', 'beta_bordro' */
    key: text('key').notNull().unique(),
    /** İnsanlar için açıklama */
    description: text('description'),
    /** Master switch — false ise rules önemli değil */
    enabled: boolean('enabled').notNull().default(false),
    /** Targeting kuralları: { orgs?: string[], plans?: string[], percentage?: number } */
    rules: jsonb('rules')
      .$type<{
        orgs?: string[];
        plans?: string[];
        users?: string[];
        percentage?: number; // 0-100
      }>()
      .default({})
      .notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    keyIdx: index('idx_feature_flags_key').on(table.key),
  }),
);

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type NewFeatureFlag = typeof featureFlags.$inferInsert;
