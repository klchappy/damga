import type { Response, RequestHandler } from 'express';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { getDb, users, apiKeys } from '@damga/db';
import type { User } from '@damga/db';
import { env, isConfigured } from '../config/env';
import { HttpError } from './error';

// ─── API key rate limiting (in-memory) ──────────────────────────────────
// Per-key counter + per-key limit cache. Tek instance için yeterli.
// Ölçeklenirse Redis'e taşınır (Upstash zaten infra'da).

interface RateSlot {
  count: number;
  resetAt: number;
}
interface LimitCache {
  limit: number;
  cachedAt: number;
}

const RATE_WINDOW_MS = 60_000;
const LIMIT_CACHE_TTL_MS = 5 * 60_000;
const _counters = new Map<string, RateSlot>();
const _limitCache = new Map<string, LimitCache>();

async function _resolveKeyLimit(keyId: string): Promise<number> {
  const now = Date.now();
  const cached = _limitCache.get(keyId);
  if (cached && now - cached.cachedAt < LIMIT_CACHE_TTL_MS) return cached.limit;
  const [k] = await getDb()
    .select({ rl: apiKeys.rate_limit_per_min })
    .from(apiKeys)
    .where(eq(apiKeys.id, keyId));
  const limit = k?.rl ?? 100;
  _limitCache.set(keyId, { limit, cachedAt: now });
  return limit;
}

/**
 * API key rate limit kontrolü. requireAuth'ın sonunda çağrılır (sadece API key auth'ta).
 * Aşımda HttpError 429 fırlatır + X-RateLimit-* headers set eder.
 */
async function _enforceApiKeyRateLimit(keyId: string, res: Response): Promise<void> {
  const now = Date.now();
  const limit = await _resolveKeyLimit(keyId);
  let slot = _counters.get(keyId);
  if (!slot || slot.resetAt < now) {
    slot = { count: 0, resetAt: now + RATE_WINDOW_MS };
    _counters.set(keyId, slot);
  }
  slot.count++;
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - slot.count)));
  res.setHeader('X-RateLimit-Reset', String(Math.floor(slot.resetAt / 1000)));
  if (slot.count > limit) {
    const retryAfter = Math.ceil((slot.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    throw new HttpError(
      429,
      `API key rate limit aşıldı (${limit}/dk). ${retryAfter} sn sonra tekrar deneyin.`,
      'RATE_LIMIT_EXCEEDED',
    );
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: User;
      authUserId?: string;
      authOrgId?: string;
      apiKeyId?: string;
      apiKeyScopes?: string[];
      /** true ise istek service-to-service key ile geldi (org_id ?org_id query param'dan resolve edildi) */
      isServiceKey?: boolean;
    }
  }
}

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabaseAdmin() {
  if (!isConfigured.supabase) {
    throw new HttpError(503, 'Supabase yapılandırılmamış', 'SUPABASE_NOT_CONFIGURED');
  }
  if (!_supabase) {
    _supabase = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _supabase;
}

/**
 * Authorization header'ını parse et:
 *   Bearer <supabase_jwt>     → kullanıcı oturumu
 *   Bearer dmg_live_<...>     → org-admin API key (entegrasyon, kendi org'una bağlı)
 *   Bearer dmg_svc_<...>      → service key (org-bağımsız, ?org_id query param zorunlu)
 *   X-API-Key: dmg_live_/svc_ → API key (alternatif header)
 *
 * API key auth durumunda per-key rate limit uygulanır (X-RateLimit-* headers).
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const header = req.headers.authorization ?? '';
    const apiKeyHeader = req.headers['x-api-key'];
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    const apiKeyRaw =
      (apiKeyHeader as string) ||
      (token?.startsWith('dmg_live_') || token?.startsWith('dmg_svc_') ? token : null);

    // 1) API key auth — iki tür: dmg_live_ (org-admin) veya dmg_svc_ (service-to-service)
    if (apiKeyRaw && (apiKeyRaw.startsWith('dmg_live_') || apiKeyRaw.startsWith('dmg_svc_'))) {
      const isService = apiKeyRaw.startsWith('dmg_svc_');
      const prefixLen = isService ? 15 : 16;
      const prefix = apiKeyRaw.slice(0, prefixLen) + '...';
      const db = getDb();
      const candidates = await db.select().from(apiKeys).where(eq(apiKeys.key_prefix, prefix));
      let matched: typeof candidates[number] | undefined;
      for (const c of candidates) {
        if (await bcrypt.compare(apiKeyRaw, c.key_hash)) {
          matched = c;
          break;
        }
      }
      if (!matched || !matched.is_active) {
        throw new HttpError(401, 'Geçersiz API key', 'INVALID_API_KEY');
      }
      if (matched.expires_at && matched.expires_at < new Date()) {
        throw new HttpError(401, 'API key süresi dolmuş', 'API_KEY_EXPIRED');
      }
      // Tip ile prefix tutarlılığı
      const expectedType = isService ? 'service' : 'org_admin';
      if (matched.key_type !== expectedType) {
        throw new HttpError(401, 'API key tipi uyuşmuyor', 'KEY_TYPE_MISMATCH');
      }

      req.apiKeyId = matched.id;
      req.apiKeyScopes = matched.scopes;

      if (isService) {
        // Service key: org_id query param ZORUNLU (cross-org leak önleme)
        const queryOrgId =
          (typeof req.query.org_id === 'string' && req.query.org_id.trim()) ||
          (typeof req.headers['x-damga-org'] === 'string' && (req.headers['x-damga-org'] as string).trim());
        if (!queryOrgId) {
          throw new HttpError(
            400,
            'Service key isteklerinde ?org_id=<uuid> query param veya X-Damga-Org header zorunlu',
            'MISSING_ORG_ID',
          );
        }
        const orgCheck = await db.execute(
          sql`
            select 1
            from public.orgs
            where id = ${queryOrgId}
              and COALESCE(org_type, 'damga_only') = 'damga_only'
            limit 1
          `,
        );
        if (orgCheck.rows.length === 0) {
          throw new HttpError(
            403,
            'Service key sadece Damga organizasyonlari icin kullanilabilir',
            'ORG_NOT_ALLOWED',
          );
        }
        req.authOrgId = queryOrgId;
        req.isServiceKey = true;
      } else {
        // Org admin key: kendi org'una bağlı
        req.authOrgId = matched.org_id ?? undefined;
      }

      // last_used_at güncelle (fire-and-forget)
      void db
        .update(apiKeys)
        .set({ last_used_at: new Date() })
        .where(eq(apiKeys.id, matched.id))
        .catch(() => {});

      // Rate limit kontrolü (per-key, in-memory)
      await _enforceApiKeyRateLimit(matched.id, res);

      next();
      return;
    }

    // 2) Supabase JWT auth
    if (!token) {
      throw new HttpError(401, 'Yetkilendirme gerekli', 'UNAUTHORIZED');
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new HttpError(401, 'Geçersiz token', 'INVALID_TOKEN');
    }

    const db = getDb();
    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.auth_user_id, data.user.id));
    if (!u) {
      throw new HttpError(404, 'Kullanıcı profili bulunamadı', 'USER_NOT_FOUND');
    }
    if (!u.is_active) {
      throw new HttpError(403, 'Kullanıcı pasif', 'USER_INACTIVE');
    }
    req.authUser = u;
    req.authUserId = u.id;
    req.authOrgId = u.org_id ?? undefined;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Sadece Supabase JWT'yi doğrular, public.users tablosunda kayıt aramaz.
 * Platform admin endpoint'leri ve self-signup akışları için (kullanıcı henüz
 * public.users'a yazılmamış olabilir veya org-bağımsız çalışılır).
 */
export interface SupabaseAuthInfo {
  authUserId: string;
  email: string;
  fullName: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      supabaseAuth?: SupabaseAuthInfo;
    }
  }
}

export const requireSupabaseAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) {
      throw new HttpError(401, 'Authorization header eksik', 'NO_TOKEN');
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      throw new HttpError(401, 'Geçersiz token', 'INVALID_TOKEN');
    }
    req.supabaseAuth = {
      authUserId: data.user.id,
      email: data.user.email ?? '',
      fullName:
        (data.user.user_metadata?.full_name as string | undefined) ??
        (data.user.user_metadata?.name as string | undefined) ??
        '',
    };
    next();
  } catch (err) {
    next(err);
  }
};

/** Belirli rollere izin ver */
export function requireRole(...roles: Array<'employee' | 'manager' | 'admin' | 'owner'>) {
  const allowed = new Set(roles);
  const handler: RequestHandler = (req, _res, next) => {
    if (!req.authUser) {
      next(new HttpError(401, 'Yetkilendirme gerekli'));
      return;
    }
    if (!allowed.has(req.authUser.role)) {
      next(new HttpError(403, 'Bu işlem için yetkiniz yok', 'FORBIDDEN'));
      return;
    }
    next();
  };
  return handler;
}

/**
 * Org kullanicisi olarak giris yapmis ama ayni zamanda platform sahibi olan kullanicilar.
 * API/entegrasyon yonetimi gibi merkezi islemler icin ikinci kilit olarak kullanilir.
 */
export const requirePlatformAdminUser: RequestHandler = async (req, _res, next) => {
  try {
    const email = req.authUser?.email;
    if (!email) {
      throw new HttpError(401, 'Yetkilendirme gerekli', 'UNAUTHORIZED');
    }

    const r = await getDb().execute(
      sql`select 1 from public.platform_admins where email = ${email} and is_active = true`,
    );
    if (r.rows.length === 0) {
      throw new HttpError(
        403,
        'API ve entegrasyon islemleri sadece sistem ana admini tarafindan yapilabilir',
        'NOT_PLATFORM_ADMIN',
      );
    }
    next();
  } catch (err) {
    next(err);
  }
};

/** API key scope kontrolü */
export function requireScope(scope: string): RequestHandler {
  return (req, _res, next) => {
    if (!req.apiKeyScopes) {
      // JWT auth'a izin ver (scope sadece API key'leri kısıtlar)
      next();
      return;
    }
    if (!req.apiKeyScopes.includes(scope)) {
      next(new HttpError(403, `Scope eksik: ${scope}`, 'MISSING_SCOPE'));
      return;
    }
    next();
  };
}
