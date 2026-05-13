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
import { requireAuth, requireSupabaseAuth } from '../middleware/auth';
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
const DAMGA_ORG_FILTER = sql`COALESCE(o.org_type, 'damga_only') = 'damga_only'`;

const ticketStatusSchema = z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed']);
const ticketPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

const createSupportTicketSchema = z.object({
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(5).max(4000),
  category: z.string().trim().min(2).max(40).default('general'),
  priority: ticketPrioritySchema.default('normal'),
});

const updateSupportTicketSchema = z.object({
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  assigned_to_email: z.string().trim().email().nullable().optional(),
  platform_notes: z.string().trim().max(4000).nullable().optional(),
});

let supportTicketsTableReady = false;

async function ensureSupportTicketsTable(): Promise<void> {
  if (supportTicketsTableReady) return;
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.support_tickets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid REFERENCES public.orgs(id) ON DELETE SET NULL,
      requester_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
      requester_email text NOT NULL,
      requester_name text,
      subject text NOT NULL,
      message text NOT NULL,
      category text NOT NULL DEFAULT 'general',
      priority text NOT NULL DEFAULT 'normal',
      status text NOT NULL DEFAULT 'open',
      assigned_to_email text,
      platform_notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      resolved_at timestamptz
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_support_tickets_org_status
    ON public.support_tickets(org_id, status)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created
    ON public.support_tickets(status, created_at DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_support_tickets_requester
    ON public.support_tickets(requester_user_id)
  `);
  await db.execute(sql`ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY`);
  supportTicketsTableReady = true;
}

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
            (SELECT count(*)::int FROM public.users WHERE org_id = o.id AND is_pending) AS pending_user_count,
            (SELECT count(*)::int FROM public.users WHERE org_id = o.id AND role = 'owner' AND is_active) AS owner_count,
            (SELECT count(*)::int FROM public.users WHERE org_id = o.id AND role = 'admin' AND is_active) AS admin_count,
            (SELECT count(*)::int FROM public.users WHERE org_id = o.id AND role = 'manager' AND is_active) AS manager_count,
            COALESCE(
              (SELECT string_agg(email, ', ' ORDER BY email) FROM public.users WHERE org_id = o.id AND role = 'owner' AND is_active),
              ''
            ) AS owner_emails,
            (SELECT count(*)::int FROM public.locations WHERE org_id = o.id) AS location_count,
            (SELECT count(*)::int FROM public.departments WHERE org_id = o.id) AS department_count,
            (SELECT count(*)::int FROM public.attendance_events WHERE org_id = o.id) AS check_in_count,
            (SELECT max(created_at)::text FROM public.attendance_events WHERE org_id = o.id) AS last_activity
          FROM public.orgs o
          WHERE ${DAMGA_ORG_FILTER}
          ORDER BY o.created_at DESC`,
    );
    res.json({ items: r.rows, count: r.rows.length });
  } catch (err) {
    next(err);
  }
});

// GET /platform/orgs/:id/users - org bazında kullanıcı erişimleri
platformRouter.get('/platform/orgs/:id/users', ...platformGuard, async (req, res, next) => {
  try {
    const orgId = z.string().uuid().parse(req.params.id);
    const orgCheck = await getDb().execute(
      sql`SELECT 1 FROM public.orgs o WHERE o.id = ${orgId} AND ${DAMGA_ORG_FILTER}`,
    );
    if (orgCheck.rows.length === 0) throw new HttpError(404, 'Organizasyon bulunamadı');

    const r = await getDb().execute(
      sql`SELECT
            u.id,
            u.email,
            u.phone,
            u.full_name,
            u.role,
            u.is_active,
            u.is_pending,
            u.created_at::text,
            u.last_login_at::text,
            (SELECT max(created_at)::text FROM public.attendance_events WHERE user_id = u.id) AS last_activity
          FROM public.users u
          WHERE u.org_id = ${orgId}
          ORDER BY
            CASE u.role
              WHEN 'owner' THEN 1
              WHEN 'admin' THEN 2
              WHEN 'manager' THEN 3
              ELSE 4
            END,
            u.is_active DESC,
            u.full_name ASC`,
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

// ─── Support Tickets ───────────────────────────────────────────────────

// POST /support/tickets - org kullanıcısı destek talebi açar
platformRouter.post('/support/tickets', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUser || !req.authOrgId) throw new HttpError(401, 'Yetki yok');
    await ensureSupportTicketsTable();
    const orgCheck = await getDb().execute(
      sql`SELECT 1 FROM public.orgs o WHERE o.id = ${req.authOrgId} AND ${DAMGA_ORG_FILTER}`,
    );
    if (orgCheck.rows.length === 0) throw new HttpError(403, 'Bu organizasyon Damga kapsamında değil');

    const input = createSupportTicketSchema.parse(req.body);

    const r = await getDb().execute(
      sql`INSERT INTO public.support_tickets (
            org_id,
            requester_user_id,
            requester_email,
            requester_name,
            subject,
            message,
            category,
            priority
          )
          VALUES (
            ${req.authOrgId},
            ${req.authUser.id},
            ${req.authUser.email},
            ${req.authUser.full_name},
            ${input.subject},
            ${input.message},
            ${input.category},
            ${input.priority}
          )
          RETURNING id, created_at::text`,
    );

    void getDb()
      .insert(auditLog)
      .values({
        org_id: req.authOrgId,
        actor_user_id: req.authUser.id,
        action: 'support.ticket_created',
        target_type: 'support_ticket',
        target_id: String((r.rows[0] as { id?: string } | undefined)?.id ?? ''),
        details: { subject: input.subject, category: input.category, priority: input.priority },
        ip_address: req.ip,
        user_agent: req.get('user-agent') ?? null,
      })
      .catch(() => {});

    res.status(201).json({ item: r.rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /platform/support-tickets - platform admin destek kuyruğu
platformRouter.get('/platform/support-tickets', ...platformGuard, async (req, res, next) => {
  try {
    await ensureSupportTicketsTable();
    const query = z
      .object({
        status: z
          .enum(['active', 'all', 'open', 'in_progress', 'waiting', 'resolved', 'closed'])
          .default('active'),
        org_id: z.string().uuid().optional(),
      })
      .parse(req.query);

    const statusWhere =
      query.status === 'active'
        ? sql`t.status IN ('open', 'in_progress', 'waiting')`
        : query.status === 'all'
          ? sql`true`
          : sql`t.status = ${query.status}`;
    const orgWhere = query.org_id ? sql`t.org_id = ${query.org_id}` : sql`true`;

    const r = await getDb().execute(
      sql`SELECT
            t.id,
            t.org_id,
            o.name AS org_name,
            o.slug AS org_slug,
            t.requester_user_id,
            t.requester_email,
            t.requester_name,
            t.subject,
            t.message,
            t.category,
            t.priority,
            t.status,
            t.assigned_to_email,
            t.platform_notes,
            t.created_at::text,
            t.updated_at::text,
            t.resolved_at::text
          FROM public.support_tickets t
          LEFT JOIN public.orgs o ON o.id = t.org_id
          WHERE ${statusWhere} AND ${orgWhere} AND (t.org_id IS NULL OR ${DAMGA_ORG_FILTER})
          ORDER BY
            CASE t.status
              WHEN 'open' THEN 1
              WHEN 'in_progress' THEN 2
              WHEN 'waiting' THEN 3
              WHEN 'resolved' THEN 4
              ELSE 5
            END,
            CASE t.priority
              WHEN 'urgent' THEN 1
              WHEN 'high' THEN 2
              WHEN 'normal' THEN 3
              ELSE 4
            END,
            t.created_at DESC
          LIMIT 100`,
    );
    res.json({ items: r.rows, count: r.rows.length });
  } catch (err) {
    next(err);
  }
});

// PATCH /platform/support-tickets/:id - platform admin talep yönetimi
platformRouter.patch('/platform/support-tickets/:id', ...platformGuard, async (req, res, next) => {
  try {
    await ensureSupportTicketsTable();
    const id = z.string().uuid().parse(req.params.id);
    const input = updateSupportTicketSchema.parse(req.body);

    const existingResult = await getDb().execute(
      sql`SELECT id, status, priority, assigned_to_email, platform_notes
          FROM public.support_tickets
          WHERE id = ${id}`,
    );
    const existing = existingResult.rows[0] as
      | {
          id: string;
          status: string;
          priority: string;
          assigned_to_email: string | null;
          platform_notes: string | null;
        }
      | undefined;
    if (!existing) throw new HttpError(404, 'Destek talebi bulunamadı');

    const nextStatus = input.status ?? existing.status;
    const nextPriority = input.priority ?? existing.priority;
    const nextAssigned =
      input.assigned_to_email === undefined ? existing.assigned_to_email : input.assigned_to_email;
    const nextNotes =
      input.platform_notes === undefined ? existing.platform_notes : input.platform_notes;
    const resolvedAt =
      nextStatus === 'resolved' || nextStatus === 'closed' ? new Date().toISOString() : null;

    const r = await getDb().execute(
      sql`UPDATE public.support_tickets
          SET
            status = ${nextStatus},
            priority = ${nextPriority},
            assigned_to_email = ${nextAssigned},
            platform_notes = ${nextNotes},
            resolved_at = ${resolvedAt},
            updated_at = now()
          WHERE id = ${id}
          RETURNING id, status, priority, assigned_to_email, platform_notes, updated_at::text, resolved_at::text`,
    );

    void getDb()
      .insert(auditLog)
      .values({
        org_id: null,
        actor_user_id: null,
        action: 'platform.support_ticket_updated',
        target_type: 'support_ticket',
        target_id: id,
        details: {
          platform_admin: req.supabaseAuth?.email ?? 'unknown',
          status: nextStatus,
          priority: nextPriority,
        },
        ip_address: req.ip,
        user_agent: req.get('user-agent') ?? null,
      })
      .catch(() => {});

    res.json({ item: r.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─── GET /platform/stats — platform geneli istatistikler ───────────────

platformRouter.get('/platform/stats', ...platformGuard, async (_req, res, next) => {
  try {
    await ensureSupportTicketsTable();
    const summary = await getDb().execute(
      sql`SELECT
            (SELECT count(*)::int FROM public.orgs o WHERE ${DAMGA_ORG_FILTER}) AS org_count,
            (SELECT count(*)::int FROM public.users u JOIN public.orgs o ON o.id = u.org_id WHERE u.is_active AND ${DAMGA_ORG_FILTER}) AS total_users,
            (SELECT count(*)::int FROM public.locations l JOIN public.orgs o ON o.id = l.org_id WHERE ${DAMGA_ORG_FILTER}) AS total_locations,
            (SELECT count(*)::int FROM public.departments d JOIN public.orgs o ON o.id = d.org_id WHERE ${DAMGA_ORG_FILTER}) AS total_departments,
            (SELECT count(*)::int FROM public.attendance_events e JOIN public.orgs o ON o.id = e.org_id WHERE ${DAMGA_ORG_FILTER}) AS total_check_ins,
            (SELECT count(*)::int FROM public.attendance_events e JOIN public.orgs o ON o.id = e.org_id WHERE e.created_at >= now() - interval '24 hours' AND ${DAMGA_ORG_FILTER}) AS check_ins_24h,
            (SELECT count(*)::int FROM public.support_tickets t LEFT JOIN public.orgs o ON o.id = t.org_id WHERE t.status IN ('open', 'in_progress', 'waiting') AND (t.org_id IS NULL OR ${DAMGA_ORG_FILTER})) AS support_active,
            (SELECT count(*)::int FROM public.support_tickets t LEFT JOIN public.orgs o ON o.id = t.org_id WHERE t.created_at >= now() - interval '24 hours' AND (t.org_id IS NULL OR ${DAMGA_ORG_FILTER})) AS support_24h`,
    );

    const planBreakdown = await getDb().execute(
      sql`SELECT plan, count(*)::int as count
          FROM public.orgs o
          WHERE ${DAMGA_ORG_FILTER}
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
