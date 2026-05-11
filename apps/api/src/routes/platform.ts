/**
 * Platform sahibi (super admin) endpoint'leri.
 *
 * Sadece public.platform_admins tablosunda kayıtlı email'ler için açılır.
 * Org_id check'i YOKTUR — tüm orgs'i görür (view-only şu an, ücretsiz dönem).
 *
 * Tablo public.platform_admins ham SQL ile sorgulanır (Drizzle schema'da yok).
 * Tek satır: kaanklc498@gmail.com (platform sahibi).
 */
import { Router, type RequestHandler } from 'express';
import { sql, eq, and, desc } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { generateServiceKey } from '@damga/verification';
import { getDb, apiKeys, auditLog } from '@damga/db';
import { requireSupabaseAuth } from '../middleware/auth';
import { HttpError } from '../middleware/error';

export const platformRouter = Router();

/**
 * Middleware: kullanıcı email'i public.platform_admins'da kayıtlı + is_active mi?
 */
const requirePlatformAdmin: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.supabaseAuth) throw new HttpError(401, 'Yetki yok');
    const r = await getDb().execute(
      sql`select 1 from public.platform_admins where email = ${req.supabaseAuth.email} and is_active = true`,
    );
    if (r.rows.length === 0)
      throw new HttpError(403, 'Sadece platform sahibi', 'NOT_PLATFORM_ADMIN');
    next();
  } catch (err) {
    next(err);
  }
};

const platformGuard = [requireSupabaseAuth, requirePlatformAdmin];

// ─── GET /platform/me — kullanıcı platform admin mi ────────────────────

platformRouter.get('/platform/me', requireSupabaseAuth, async (req, res, next) => {
  try {
    if (!req.supabaseAuth) throw new HttpError(401, 'Yetki yok');
    const r = await getDb().execute(
      sql`select id, email, full_name, is_active from public.platform_admins where email = ${req.supabaseAuth.email}`,
    );
    const admin = r.rows[0] as
      | { id: string; email: string; full_name: string | null; is_active: boolean }
      | undefined;
    res.json({
      is_platform_admin: !!admin && admin.is_active,
      admin: admin ? { id: admin.id, email: admin.email, full_name: admin.full_name } : null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /platform/orgs — tüm org'ları listele (Damga metrikleri) ──────

platformRouter.get('/platform/orgs', ...platformGuard, async (_req, res, next) => {
  try {
    const r = await getDb().execute(
      sql`SELECT
            o.id, o.name, o.slug, o.plan,
            COALESCE(o.org_type, 'damga_only') AS org_type,
            o.created_at::text,
            (SELECT count(*)::int FROM public.users WHERE org_id = o.id AND is_active) AS user_count,
            (SELECT count(*)::int FROM public.locations WHERE org_id = o.id) AS location_count,
            (SELECT count(*)::int FROM public.departments WHERE org_id = o.id) AS department_count,
            (SELECT count(*)::int FROM public.attendance_events WHERE org_id = o.id) AS check_in_count,
            (SELECT max(created_at)::text FROM public.attendance_events WHERE org_id = o.id) AS last_activity
          FROM public.orgs o
          ORDER BY o.created_at DESC`,
    );
    res.json({ items: r.rows, count: r.rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── Service Keys (S2S) ────────────────────────────────────────────────

const createServiceKeySchema = z.object({
  name: z.string().trim().min(2).max(100),
  scopes: z.array(z.string().trim().min(1)).min(1),
  rate_limit_per_min: z.number().int().min(1).max(10000).optional(),
  expires_at: z.string().datetime().nullable().optional(),
});

// POST /platform/service-keys — yeni service key üret (raw key sadece burada döner)
platformRouter.post('/platform/service-keys', ...platformGuard, async (req, res, next) => {
  try {
    const input = createServiceKeySchema.parse(req.body);
    const { raw, prefix } = generateServiceKey();
    const hash = await bcrypt.hash(raw, 12);

    const [k] = await getDb()
      .insert(apiKeys)
      .values({
        org_id: null,
        key_type: 'service',
        name: input.name,
        key_hash: hash,
        key_prefix: prefix,
        scopes: input.scopes,
        rate_limit_per_min: input.rate_limit_per_min ?? 100,
        expires_at: input.expires_at ? new Date(input.expires_at) : null,
        created_by: null,
      })
      .returning();
    if (!k) throw new HttpError(500, 'Service key oluşturulamadı');

    // Audit (org_id null çünkü platform-level)
    void getDb()
      .insert(auditLog)
      .values({
        org_id: null,
        actor_user_id: null,
        action: 'platform.service_key_created',
        target_type: 'api_key',
        target_id: k.id,
        details: {
          name: k.name,
          scopes: k.scopes,
          platform_admin: req.supabaseAuth?.email ?? 'unknown',
        },
        ip_address: req.ip,
        user_agent: req.get('user-agent') ?? null,
      })
      .catch(() => {});

    res.status(201).json({
      service_key: {
        id: k.id,
        name: k.name,
        key_prefix: k.key_prefix,
        scopes: k.scopes,
        rate_limit_per_min: k.rate_limit_per_min,
        created_at: k.created_at,
      },
      secret_key: raw,
      warning:
        'Bu key bir daha gösterilmeyecek. Şimdi kopyala ve güvenli sakla. Kullanırken: Authorization: Bearer <key> + ?org_id=<uuid> query param zorunlu.',
    });
  } catch (err) {
    next(err);
  }
});

// GET /platform/service-keys — service key listele (raw göstermez)
platformRouter.get('/platform/service-keys', ...platformGuard, async (_req, res, next) => {
  try {
    const rows = await getDb()
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        key_prefix: apiKeys.key_prefix,
        scopes: apiKeys.scopes,
        rate_limit_per_min: apiKeys.rate_limit_per_min,
        last_used_at: apiKeys.last_used_at,
        expires_at: apiKeys.expires_at,
        is_active: apiKeys.is_active,
        created_at: apiKeys.created_at,
      })
      .from(apiKeys)
      .where(eq(apiKeys.key_type, 'service'))
      .orderBy(desc(apiKeys.created_at));
    res.json({ items: rows, count: rows.length });
  } catch (err) {
    next(err);
  }
});

// DELETE /platform/service-keys/:id — service key sil
platformRouter.delete('/platform/service-keys/:id', ...platformGuard, async (req, res, next) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const [k] = await getDb()
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.key_type, 'service')))
      .returning();
    if (!k) throw new HttpError(404, 'Service key bulunamadı');

    void getDb()
      .insert(auditLog)
      .values({
        org_id: null,
        actor_user_id: null,
        action: 'platform.service_key_revoked',
        target_type: 'api_key',
        target_id: id,
        details: {
          name: k.name,
          platform_admin: req.supabaseAuth?.email ?? 'unknown',
        },
        ip_address: req.ip,
        user_agent: req.get('user-agent') ?? null,
      })
      .catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /platform/stats — platform geneli istatistikler ───────────────

platformRouter.get('/platform/stats', ...platformGuard, async (_req, res, next) => {
  try {
    const summary = await getDb().execute(
      sql`SELECT
            (SELECT count(*)::int FROM public.orgs) AS org_count,
            (SELECT count(*)::int FROM public.users WHERE is_active) AS total_users,
            (SELECT count(*)::int FROM public.locations) AS total_locations,
            (SELECT count(*)::int FROM public.departments) AS total_departments,
            (SELECT count(*)::int FROM public.attendance_events) AS total_check_ins,
            (SELECT count(*)::int FROM public.attendance_events WHERE created_at >= now() - interval '24 hours') AS check_ins_24h`,
    );

    const planBreakdown = await getDb().execute(
      sql`SELECT plan, count(*)::int as count
          FROM public.orgs
          GROUP BY plan
          ORDER BY count DESC`,
    );

    res.json({
      summary: summary.rows[0] ?? {},
      plan_breakdown: planBreakdown.rows,
    });
  } catch (err) {
    next(err);
  }
});
