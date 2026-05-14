/**
 * Feature flag evaluator — gated rollout için runtime kararı.
 *
 * Cache: 30 saniye in-memory (production'da Redis'e geçecek scale time).
 * Toplam <20 flag bekleniyor — full in-memory cache OK.
 *
 * Kullanım:
 *   const enabled = await isFeatureEnabled('new_dashboard', { orgId, plan });
 *   if (enabled) ... // yeni davranış
 */
import { eq } from 'drizzle-orm';
import { getDb, featureFlags } from '@damga/db';
import { logger } from '../config/logger';

interface FlagContext {
  /** Kullanıcının org_id'si */
  orgId?: string | null;
  /** Kullanıcının plan'ı (free/starter/pro/business) */
  plan?: string | null;
  /** Kullanıcının user_id'si (hash-based percentage rollout için) */
  userId?: string | null;
}

interface CachedFlag {
  enabled: boolean;
  rules: {
    orgs?: string[];
    plans?: string[];
    users?: string[];
    percentage?: number;
  };
  cachedAt: number;
}

const CACHE_TTL_MS = 30_000; // 30 saniye — flag değişiklikleri 30sn içinde yansır
const _cache = new Map<string, CachedFlag>();

/**
 * Hash-based deterministic rollout — aynı user her sorguda aynı sonuç alır.
 * Math.random() değil, çünkü session'lar arası tutarlılık lazım.
 */
function hashToPercentage(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100;
}

async function loadFlag(key: string): Promise<CachedFlag | null> {
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached;

  try {
    const [row] = await getDb()
      .select({ enabled: featureFlags.enabled, rules: featureFlags.rules })
      .from(featureFlags)
      .where(eq(featureFlags.key, key));

    const flag: CachedFlag = {
      enabled: row?.enabled ?? false,
      rules: row?.rules ?? {},
      cachedAt: Date.now(),
    };
    _cache.set(key, flag);
    return flag;
  } catch (err) {
    logger.warn({ err, key }, 'feature flag load failed — disabled döner');
    return { enabled: false, rules: {}, cachedAt: Date.now() };
  }
}

/**
 * Belirtilen context ile bu flag açık mı?
 */
export async function isFeatureEnabled(
  key: string,
  context: FlagContext = {},
): Promise<boolean> {
  const flag = await loadFlag(key);
  if (!flag || !flag.enabled) return false;

  const { rules } = flag;

  // Targeting: spesifik kullanıcı listesi (geçerli)
  if (rules.users && rules.users.length > 0) {
    if (!context.userId || !rules.users.includes(context.userId)) {
      return false;
    }
  }

  // Targeting: spesifik org listesi
  if (rules.orgs && rules.orgs.length > 0) {
    if (!context.orgId || !rules.orgs.includes(context.orgId)) {
      return false;
    }
  }

  // Targeting: plan filtresi
  if (rules.plans && rules.plans.length > 0) {
    if (!context.plan || !rules.plans.includes(context.plan)) {
      return false;
    }
  }

  // Percentage-based rollout (hash-based deterministic)
  if (typeof rules.percentage === 'number' && rules.percentage < 100) {
    const seed = context.userId ?? context.orgId ?? 'anonymous';
    const userPercent = hashToPercentage(`${key}:${seed}`);
    if (userPercent >= rules.percentage) {
      return false;
    }
  }

  return true;
}

/**
 * Cache'i manuel sıfırla (admin flag değiştirdiğinde çağrılır).
 */
export function clearFlagCache(): void {
  _cache.clear();
}
