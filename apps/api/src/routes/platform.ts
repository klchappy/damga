/**
 * Platform sahibi (super admin) endpoint'leri.
 *
 * Sadece public.platform_admins tablosunda kayıtlı email'ler için açılır.
 * Org_id check'i YOKTUR — tüm orgs'i görür (view-only şu an, ücretsiz dönem).
 *
 * Tablo public.platform_admins, Lokma migration'ıyla oluşturuldu — Damga ile
 * paylaşımlı; Damga schema'da Drizzle tarafında yok, raw SQL ile erişilir.
 */
import { Router, type RequestHandler } from 'express';
import { sql } from 'drizzle-orm';
import { getDb } from '@damga/db';
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
