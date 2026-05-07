import type { RequestHandler } from 'express';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDb, users, apiKeys } from '@damga/db';
import type { User } from '@damga/db';
import { env, isConfigured } from '../config/env';
import { HttpError } from './error';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: User;
      authUserId?: string;
      authOrgId?: string;
      apiKeyId?: string;
      apiKeyScopes?: string[];
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
 *   Bearer <supabase_jwt> → kullanıcı oturumu
 *   Bearer dmg_live_<...> → API key (entegrasyon)
 *   X-API-Key: dmg_live_<...> → API key (alternatif)
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization ?? '';
    const apiKeyHeader = req.headers['x-api-key'];
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    const apiKeyRaw = (apiKeyHeader as string) || (token?.startsWith('dmg_live_') ? token : null);

    // 1) API key auth
    if (apiKeyRaw && apiKeyRaw.startsWith('dmg_live_')) {
      const prefix = apiKeyRaw.slice(0, 16) + '...';
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
      req.apiKeyId = matched.id;
      req.apiKeyScopes = matched.scopes;
      req.authOrgId = matched.org_id;
      // last_used_at güncelle (fire-and-forget)
      void db
        .update(apiKeys)
        .set({ last_used_at: new Date() })
        .where(eq(apiKeys.id, matched.id))
        .catch(() => {});
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
