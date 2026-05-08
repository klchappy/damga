import { Router } from 'express';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { applyOrgSchema, reviewApplicationSchema, assignUserOrgSchema } from '@damga/shared';
import {
  getDb,
  organizationApplications,
  users,
  orgs,
  departments,
} from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';
import { authLimiter } from '../middleware/rate-limit';
import { logger } from '../config/logger';

export const applicationsRouter = Router();

/**
 * POST /v1/auth/apply-org — public
 * Yeni şirket başvurusu. Admin onayı sonrası org + owner kullanıcı oluşturulur.
 */
applicationsRouter.post('/auth/apply-org', authLimiter, async (req, res, next) => {
  try {
    const input = applyOrgSchema.parse(req.body);
    const db = getDb();

    // Aynı email ile zaten pending başvuru var mı?
    const dup = await db
      .select({ id: organizationApplications.id })
      .from(organizationApplications)
      .where(
        and(
          eq(organizationApplications.applicant_email, input.applicant_email),
          eq(organizationApplications.status, 'pending'),
        ),
      );
    if (dup.length > 0) {
      throw new HttpError(
        409,
        'Bu e-posta ile bekleyen bir başvurun zaten var. Onay sonrası bilgilendirileceksin.',
        'APPLICATION_DUPLICATE',
      );
    }

    const [app] = await db
      .insert(organizationApplications)
      .values({
        org_name: input.org_name,
        tax_id: input.tax_id || null,
        industry: input.industry || null,
        employee_count_estimate: input.employee_count_estimate ?? null,
        applicant_full_name: input.applicant_full_name,
        applicant_email: input.applicant_email.toLowerCase(),
        applicant_phone: input.applicant_phone || null,
        applicant_title: input.applicant_title || null,
        notes: input.notes || null,
        status: 'pending',
        ip_address: maskIp(req.ip ?? ''),
        user_agent: req.headers['user-agent']?.slice(0, 200) ?? null,
      })
      .returning();

    logger.info({ appId: app!.id, email: app!.applicant_email }, 'Yeni şirket başvurusu');

    res.status(201).json({
      application_id: app!.id,
      message:
        'Başvurun alındı. Admin tarafından incelendikten sonra ' +
        input.applicant_email +
        ' adresine giriş bilgilerin gönderilecek.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/admin/applications — Damga sistem admini görür.
 *
 * Şu an "owner" rolü en yüksek + 'is_admin sistem' kavramı yok →
 * en az 1 owner olan tek kullanıcı (Kaan) bunları onaylayacak.
 * İleride: separate `is_super_admin` flag.
 */
applicationsRouter.get(
  '/admin/applications',
  requireAuth,
  requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const status = String(req.query.status ?? 'pending');
      const rows = await getDb()
        .select()
        .from(organizationApplications)
        .where(
          status === 'all'
            ? undefined
            : eq(
                organizationApplications.status,
                status as 'pending' | 'approved' | 'rejected',
              ),
        )
        .orderBy(desc(organizationApplications.created_at));
      res.json({ items: rows });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/admin/applications/:id/review
 * Body: { decision: 'approve' | 'reject', rejection_reason? }
 *
 * Approve → orgs + users (owner) + 4 default departman seed + magic link gönder
 * Reject → status=rejected
 */
applicationsRouter.post(
  '/admin/applications/:id/review',
  requireAuth,
  requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      if (!req.authUserId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const body = reviewApplicationSchema.parse(req.body);
      const db = getDb();

      const [app] = await db
        .select()
        .from(organizationApplications)
        .where(eq(organizationApplications.id, id));
      if (!app) throw new HttpError(404, 'Başvuru bulunamadı');
      if (app.status !== 'pending') {
        throw new HttpError(400, `Başvuru zaten ${app.status} durumunda`, 'ALREADY_REVIEWED');
      }

      if (body.decision === 'reject') {
        await db
          .update(organizationApplications)
          .set({
            status: 'rejected',
            rejection_reason: body.rejection_reason ?? null,
            reviewed_by_user_id: req.authUserId,
            reviewed_at: new Date(),
          })
          .where(eq(organizationApplications.id, id));
        res.json({ ok: true, action: 'rejected' });
        return;
      }

      // === ONAY ===

      // Slug üret
      const baseSlug = app.org_name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
      const slug = `${baseSlug || 'sirket'}-${Math.random().toString(36).slice(2, 6)}`;

      // Org oluştur
      const [newOrg] = await db
        .insert(orgs)
        .values({
          name: app.org_name,
          slug,
          plan: 'free',
          kvkk_consent_text: `${app.org_name} KVKK aydınlatma metni — admin tarafından düzenlenecek.`,
        })
        .returning();

      // 4 default departman seed
      await db.insert(departments).values([
        { org_id: newOrg!.id, name: 'Satış', slug: 'satis', color: '#10B981', is_default: true },
        { org_id: newOrg!.id, name: 'Sevk', slug: 'sevk', color: '#3B82F6', is_default: true },
        { org_id: newOrg!.id, name: 'Muhasebe', slug: 'muhasebe', color: '#8B5CF6', is_default: true },
        { org_id: newOrg!.id, name: 'Diğer', slug: 'diger', color: '#9CA3AF', is_default: true },
      ]);

      // Supabase Auth user oluştur (random şifre, magic link ile gelecek)
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.SUPABASE_URL ?? '',
        process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        { auth: { autoRefreshToken: false, persistSession: false } },
      );

      // Auth'ta var mı bak
      const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
      const existingAuth = existing?.users.find(
        (u) => u.email?.toLowerCase() === app.applicant_email.toLowerCase(),
      );

      let authUserId: string;
      if (existingAuth) {
        authUserId = existingAuth.id;
      } else {
        // Random şifre — kullanıcı magic link / şifre reset ile girecek
        const tmpPassword = Math.random().toString(36).slice(2) + 'A1!';
        const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
          email: app.applicant_email,
          password: tmpPassword,
          email_confirm: true,
          user_metadata: { full_name: app.applicant_full_name },
        });
        if (authErr || !authData.user) {
          throw new HttpError(500, `Auth user oluşturulamadı: ${authErr?.message}`);
        }
        authUserId = authData.user.id;
      }

      // Damga DB user
      const [newUser] = await db
        .insert(users)
        .values({
          org_id: newOrg!.id,
          auth_user_id: authUserId,
          email: app.applicant_email,
          full_name: app.applicant_full_name,
          role: 'owner',
          title: app.applicant_title ?? null,
          department: 'Diğer',
        })
        .returning();

      // Magic link / şifre belirleme maili (Supabase recovery → ResetPassword sayfası)
      try {
        await supabaseAdmin.auth.resetPasswordForEmail(app.applicant_email, {
          redirectTo: `${process.env.CLIENT_URL ?? 'https://damga.deploi.net'}/auth/reset-password`,
        });
      } catch (e) {
        logger.warn({ err: e }, 'magic link gönderim hatası — admin manuel paylaşmalı');
      }

      // Application'ı approved olarak işaretle
      await db
        .update(organizationApplications)
        .set({
          status: 'approved',
          created_org_id: newOrg!.id,
          created_user_id: newUser!.id,
          reviewed_by_user_id: req.authUserId,
          reviewed_at: new Date(),
        })
        .where(eq(organizationApplications.id, id));

      logger.info(
        { appId: id, orgId: newOrg!.id, userId: newUser!.id },
        'Başvuru onaylandı, org + owner oluşturuldu',
      );

      res.json({
        ok: true,
        action: 'approved',
        org_id: newOrg!.id,
        user_id: newUser!.id,
        magic_link_sent_to: app.applicant_email,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /v1/admin/pending-users — admin'in bir org'a atayacağı kullanıcılar
 * (org_id null + is_pending=true).
 */
applicationsRouter.get(
  '/admin/pending-users',
  requireAuth,
  requireRole('owner', 'admin'),
  async (_req, res, next) => {
    try {
      const rows = await getDb()
        .select()
        .from(users)
        .where(and(isNull(users.org_id), eq(users.is_pending, true)))
        .orderBy(desc(users.created_at));
      res.json({ items: rows });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/admin/pending-users/:id/assign
 * Body: { org_id, role, department }
 */
applicationsRouter.post(
  '/admin/pending-users/:id/assign',
  requireAuth,
  requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = String(req.params.id ?? '').trim();
      const body = assignUserOrgSchema.parse(req.body);
      const db = getDb();

      const [u] = await db
        .update(users)
        .set({
          org_id: body.org_id,
          role: body.role,
          department: body.department ?? 'Diğer',
          is_pending: false,
          updated_at: new Date(),
        })
        .where(and(eq(users.id, id), eq(users.is_pending, true)))
        .returning();
      if (!u) throw new HttpError(404, 'Bekleyen kullanıcı bulunamadı');

      res.json({ ok: true, user: u });
    } catch (err) {
      next(err);
    }
  },
);

/* IP maskeleme helper (KVKK) */
function maskIp(ip: string): string {
  if (!ip) return '';
  const v4 = ip.match(/^(\d+\.\d+)\./);
  if (v4) return v4[1] + '.0.0';
  return ip.split(':').slice(0, 4).join(':') + '::';
}
