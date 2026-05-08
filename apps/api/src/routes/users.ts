import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { createUserSchema, adminUpdateUserSchema } from '@damga/shared';
import { getDb, users } from '@damga/db';
import { env, isConfigured } from '../config/env';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';
import { logger } from '../config/logger';

export const usersRouter = Router();

function getSupabaseAdmin() {
  if (!isConfigured.supabase) {
    throw new HttpError(503, 'Supabase yapılandırılmamış', 'SUPABASE_NOT_CONFIGURED');
  }
  return createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

usersRouter.get(
  '/users',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const rows = await getDb()
        .select()
        .from(users)
        .where(eq(users.org_id, req.authOrgId));
      res.json({ items: rows });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/users — admin/owner yeni çalışan ekler.
 *
 * Tek atışta:
 *  1) Email duplicate kontrolü
 *  2) Supabase Auth user oluştur (random password, email_confirm:true)
 *  3) Damga DB users insert (org_id, role, department, vb)
 *  4) resetPasswordForEmail → kullanıcıya şifre belirleme maili
 *
 * Sonuç: kullanıcı maile gelen linkle kendi şifresini belirler ve giriş yapar.
 * (apply-org onay akışıyla aynı pattern.)
 */
usersRouter.post(
  '/users',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUser) throw new HttpError(401, 'Yetki yok');
      const input = createUserSchema.parse(req.body);

      // owner sadece owner ekleyebilir
      if (input.role === 'owner' && req.authUser.role !== 'owner') {
        throw new HttpError(403, 'Sadece şirket sahibi başka owner ekleyebilir', 'OWNER_ONLY');
      }

      const db = getDb();

      // Aynı email var mı?
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email.toLowerCase()));
      if (existing) {
        throw new HttpError(409, 'Bu e-posta zaten kayıtlı', 'EMAIL_EXISTS');
      }

      const supabase = getSupabaseAdmin();

      // Supabase'de var mı? (başka org'da olabilir)
      const { data: existingAuth } = await supabase.auth.admin.listUsers();
      const matched = existingAuth?.users.find(
        (u) => u.email?.toLowerCase() === input.email.toLowerCase(),
      );

      let authUserId: string;
      if (matched) {
        authUserId = matched.id;
      } else {
        const tmpPassword = Math.random().toString(36).slice(2) + 'A1!';
        const { data: created, error: authErr } = await supabase.auth.admin.createUser({
          email: input.email,
          password: tmpPassword,
          email_confirm: true,
          user_metadata: { full_name: input.full_name },
        });
        if (authErr || !created.user) {
          throw new HttpError(
            502,
            `Auth user oluşturulamadı: ${authErr?.message ?? 'unknown'}`,
            'AUTH_CREATE_FAILED',
          );
        }
        authUserId = created.user.id;
      }

      const [user] = await db
        .insert(users)
        .values({
          org_id: req.authOrgId,
          auth_user_id: authUserId,
          email: input.email.toLowerCase(),
          full_name: input.full_name,
          role: input.role,
          department: input.department ?? 'Diğer',
          title: input.title ?? null,
          hired_at: input.hired_at ?? null,
          annual_leave_quota_days: input.annual_leave_quota_days,
        })
        .returning();

      // Şifre belirleme maili
      let mailSent = false;
      try {
        await supabase.auth.resetPasswordForEmail(input.email, {
          redirectTo: `${env.CLIENT_URL ?? 'https://damga.deploi.net'}/auth/reset-password`,
        });
        mailSent = true;
      } catch (e) {
        logger.warn(
          { err: e, email: input.email },
          'Şifre belirleme maili gönderilemedi — admin manuel paylaşmalı',
        );
      }

      logger.info(
        { userId: user!.id, by: req.authUserId, orgId: req.authOrgId },
        'Admin yeni çalışan ekledi',
      );

      res.status(201).json({ user, password_reset_sent: mailSent });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /v1/users/:id — admin/owner tam yetki:
 * - role değiştir (owner sadece owner ekleyebilir)
 * - department, title, hired_at, izin kotası
 * - is_active (pasif yap → giriş yapamaz)
 *
 * Şifre sıfırlama AYRI: /v1/users/:id/password-reset → Supabase admin recovery mail.
 */
usersRouter.patch(
  '/users/:id',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const input = adminUpdateUserSchema.parse(req.body);

      // Sadece owner başkasını owner yapabilir veya owner'lığı kaldırabilir
      if (input.role === 'owner' && req.authUser?.role !== 'owner') {
        throw new HttpError(403, 'Sadece şirket sahibi başka owner ekleyebilir', 'OWNER_ONLY');
      }

      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (input.full_name !== undefined) updates.full_name = input.full_name;
      if (input.role !== undefined) updates.role = input.role;
      if (input.department !== undefined) updates.department = input.department;
      if (input.title !== undefined) updates.title = input.title;
      if (input.hired_at !== undefined) updates.hired_at = input.hired_at;
      if (input.annual_leave_quota_days !== undefined)
        updates.annual_leave_quota_days = input.annual_leave_quota_days;
      if (input.is_active !== undefined) updates.is_active = input.is_active;

      const [user] = await getDb()
        .update(users)
        .set(updates)
        .where(and(eq(users.id, id), eq(users.org_id, req.authOrgId)))
        .returning();
      if (!user) throw new HttpError(404, 'Çalışan bulunamadı');
      res.json({ user });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/users/:id/password-reset — admin tetikler.
 * Supabase Admin API ile recovery e-postası gönderir.
 */
usersRouter.post(
  '/users/:id/password-reset',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const [u] = await getDb()
        .select({ email: users.email, auth_user_id: users.auth_user_id })
        .from(users)
        .where(and(eq(users.id, id), eq(users.org_id, req.authOrgId)));
      if (!u) throw new HttpError(404, 'Çalışan bulunamadı');

      // Supabase Admin API
      const { createClient } = await import('@supabase/supabase-js');
      const admin = createClient(
        process.env.SUPABASE_URL ?? '',
        process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const { error } = await admin.auth.resetPasswordForEmail(u.email, {
        redirectTo: `${process.env.CLIENT_URL ?? 'https://damga.deploi.net'}/auth/reset-password`,
      });
      if (error) throw new HttpError(502, `Mail gönderilemedi: ${error.message}`);
      res.json({ ok: true, sent_to: u.email });
    } catch (err) {
      next(err);
    }
  },
);
