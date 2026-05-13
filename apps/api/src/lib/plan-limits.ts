import { sql } from 'drizzle-orm';
import { PLAN_LIMITS } from '@damga/shared';
import { getDb } from '@damga/db';

type PlanName = keyof typeof PLAN_LIMITS;
type LimitKey = 'users' | 'locations' | 'api_keys' | 'webhooks';

let tableReady = false;

const PLAN_ROWS: Array<{
  plan: PlanName;
  label: string;
  price: number;
  users: number | null;
  locations: number | null;
  apiKeys: number | null;
  webhooks: number | null;
}> = [
  { plan: 'free', label: 'Free', price: 0, users: 3, locations: 1, apiKeys: 0, webhooks: 0 },
  { plan: 'starter', label: 'Starter', price: 99, users: 10, locations: 2, apiKeys: 1, webhooks: 1 },
  { plan: 'pro', label: 'Pro', price: 299, users: 25, locations: 5, apiKeys: 3, webhooks: 3 },
  { plan: 'business', label: 'Business', price: 899, users: 100, locations: 20, apiKeys: 10, webhooks: 10 },
  { plan: 'enterprise', label: 'Enterprise', price: 0, users: null, locations: null, apiKeys: null, webhooks: null },
];

export async function ensurePlanCatalogTable(): Promise<void> {
  if (tableReady) return;
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.platform_plan_catalog (
      plan text PRIMARY KEY,
      label text NOT NULL,
      description text NOT NULL DEFAULT '',
      price_try_monthly integer NOT NULL DEFAULT 0,
      users_limit integer,
      locations_limit integer,
      api_keys_limit integer,
      webhooks_limit integer,
      features text[] NOT NULL DEFAULT '{}',
      is_public boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const row of PLAN_ROWS) {
    await db.execute(sql`
      INSERT INTO public.platform_plan_catalog (
        plan,
        label,
        description,
        price_try_monthly,
        users_limit,
        locations_limit,
        api_keys_limit,
        webhooks_limit,
        features
      )
      VALUES (
        ${row.plan},
        ${row.label},
        ${row.plan === 'free' ? 'Baslangic ve pilot kullanim' : 'Kurumsal Damga plani'},
        ${row.price},
        ${row.users},
        ${row.locations},
        ${row.apiKeys},
        ${row.webhooks},
        ${['Kullanici yonetimi', 'Damga takibi', 'Raporlama']}
      )
      ON CONFLICT (plan) DO NOTHING
    `);
  }

  tableReady = true;
}

export async function getPlanLimit(plan: string, key: LimitKey): Promise<number> {
  await ensurePlanCatalogTable();
  const columnByKey = {
    users: sql`users_limit`,
    locations: sql`locations_limit`,
    api_keys: sql`api_keys_limit`,
    webhooks: sql`webhooks_limit`,
  } as const;
  const result = await getDb().execute(
    sql`SELECT ${columnByKey[key]} AS value FROM public.platform_plan_catalog WHERE plan = ${plan}`,
  );
  const value = (result.rows[0] as { value?: number | null } | undefined)?.value;
  if (value == null) return Infinity;

  const fallback = PLAN_LIMITS[(plan as PlanName) || 'free']?.[key] ?? value;
  return Number.isFinite(value) ? value : fallback;
}
