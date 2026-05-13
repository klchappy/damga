import { Router } from 'express';
import { eq, and, count } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createUserSchema, adminUpdateUserSchema } from '@damga/shared';
import { getDb, orgs, users } from '@damga/db';
import { env, isConfigured } from '../config/env';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';
import { logger } from '../config/logger';
import { generateStrongPassword } from '../lib/password';
import { buildPasswordMessage, sendSms, sendWhatsApp } from '../lib/notify';
import { getPlanLimit } from '../lib/plan-limits';

export const usersRouter = Router();

function getSupabaseAdmin() {
  if (!isConfigured.supabase) {
    throw new HttpError(
      503,
      'Supabase yapılandırılmamış',
      'SUPABASE_NOT_CONFIGURED',
    );
  }
  return createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * PATCH /v1/users/me — kullanıcı kendi profilini günceller.
 *
 * İzin verilen alanlar: full_name, title, avatar_url.
 * Email/role/department/org_id BU endpoint'ten DEĞİŞTİRİLEMEZ (sadece admin).
 */
const updateSelfSchema = z.object({
  full_name: z.string().trim().min(2).max(100).optional(),
  title: z.string().trim().max(80).optional().nullable(),
  avatar_url: z.string().url().optional().nullable(),
  username: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9._-]{3,32}$/i,
      'Kullanıcı adı 3-32 karakter (harf/rakam/.-_)',
    )
    .optional()
    .nullable(),
  phone: z
    .string()
    .trim()
    .regex(/^\+\d{10,15}$/, 'Telefon +905xx... (E.164) formatında olmalı')
    .optional()
    .nullable(),
});

usersRouter.patch('/users/me', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUserId) throw new HttpError(401, 'Yetki yok');
    const input = updateSelfSchema.parse(req.body);

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (input.full_name !== undefined) updates.full_name = input.full_name;
    if (input.title !== undefined) updates.title = input.title;
    if (input.avatar_url !== undefined) updates.avatar_url = input.avatar_url;
    if (input.username !== undefined)
      updates.username = input.username ? input.username.toLowerCase() : null;
    if (input.phone !== undefined) updates.phone = input.phone || null;

    const [user] = await getDb()
      .update(users)
      .set(updates)
      .where(eq(users.id, req.authUserId))
      .returning();
    if (!user) throw new HttpError(404, 'Kullanıcı bulunamadı');

    logger.info(
      { userId: req.authUserId },
      'Kullanıcı kendi profilini güncelledi',
    );
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

usersRouter.get(
  '/users',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const includeInactive =
        req.query.include_inactive === '1' ||
        req.query.include_inactive === 'true';
      const conditions = [eq(users.org_id, req.authOrgId)];
      if (!includeInactive) conditions.push(eq(users.is_active, true));
      const rows = await getDb()
        .select()
        .from(users)
        .where(and(...conditions));
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
      if (!req.authOrgId || !req.authUser)
        throw new HttpError(401, 'Yetki yok');
      const input = createUserSchema.parse(req.body);

      // owner sadece owner ekleyebilir
      if (input.role === 'owner' && req.authUser.role !== 'owner') {
        throw new HttpError(
          403,
          'Sadece şirket sahibi başka owner ekleyebilir',
          'OWNER_ONLY',
        );
      }

      const db = getDb();

      const [orgPlan] = await db
        .select({ plan: orgs.plan })
        .from(orgs)
        .where(eq(orgs.id, req.authOrgId));
      const plan = orgPlan?.plan ?? 'free';
      const [usage] = await db
        .select({ total: count() })
        .from(users)
        .where(and(eq(users.org_id, req.authOrgId), eq(users.is_active, true)));
      const userLimit = await getPlanLimit(plan, 'users');
      if (Number.isFinite(userLimit) && (usage?.total ?? 0) >= userLimit) {
        throw new HttpError(
          402,
          `Bu plan en fazla ${userLimit} aktif kullaniciya izin verir. Plan yukseltmesi icin destek talebi acin.`,
          'PLAN_LIMIT_USERS',
        );
      }

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
        const { data: created, error: authErr } =
          await supabase.auth.admin.createUser({
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
          username: input.username?.toLowerCase() || null,
          phone: input.phone || null,
          full_name: input.full_name,
          role: input.role,
          department: input.department ?? 'Diğer',
          title: input.title ?? null,
          hired_at: input.hired_at ?? null,
          annual_leave_quota_days: input.annual_leave_quota_days,
        })
        .returning();

      // Şifre belirleme URL'si — generateLink ile mail GÖNDERMEDEN üret.
      // (resetPasswordForEmail Supabase rate-limit'ine takılıyor; bu yöntem email
      // göndermez, doğrudan kullanılabilir bir URL döner — admin link'i manuel
      // paylaşır: WhatsApp, kurumsal mail, fiziksel teslim, vb.)
      const redirectTo = `${env.CLIENT_URL ?? 'https://damga.deploi.net'}/auth/reset-password`;
      let resetLink: string | null = null;
      let resetError: string | null = null;
      try {
        const { data: linkData, error: linkErr } =
          await supabase.auth.admin.generateLink({
            type: 'recovery',
            email: input.email,
            options: { redirectTo },
          });
        if (linkErr || !linkData?.properties?.action_link) {
          resetError = linkErr?.message ?? 'Link üretilemedi';
        } else {
          resetLink = linkData.properties.action_link;
        }
      } catch (e) {
        resetError = e instanceof Error ? e.message : 'Bilinmeyen hata';
      }
      if (!resetLink) {
        logger.warn(
          { err: resetError, email: input.email },
          'Şifre belirleme link üretilemedi — kullanıcı şifre sıfırlama akışıyla giriş yapsın',
        );
      }

      logger.info(
        { userId: user!.id, by: req.authUserId, orgId: req.authOrgId },
        'Admin yeni çalışan ekledi',
      );

      res.status(201).json({
        user,
        /** Direkt paylaşılabilir şifre belirleme URL'si (admin kopyalar/share eder) */
        password_reset_link: resetLink,
        password_reset_error: resetError,
      });
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
      if (!req.authOrgId || !req.authUserId)
        throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const input = adminUpdateUserSchema.parse(req.body);

      // Sadece owner başkasını owner yapabilir veya owner'lığı kaldırabilir
      if (input.role === 'owner' && req.authUser?.role !== 'owner') {
        throw new HttpError(
          403,
          'Sadece şirket sahibi başka owner ekleyebilir',
          'OWNER_ONLY',
        );
      }

      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (input.full_name !== undefined) updates.full_name = input.full_name;
      if (input.role !== undefined) updates.role = input.role;
      if (input.department !== undefined) updates.department = input.department;
      if (input.title !== undefined) updates.title = input.title;
      if (input.phone !== undefined) updates.phone = input.phone || null;
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
 * POST /v1/users/:id/password-reset — admin şifre sıfırlama linki üretir.
 *
 * Mail GÖNDERMEZ (rate-limit'e takılmıyor); generateLink ile doğrudan kullanılabilir
 * recovery URL döner; admin link'i manuel paylaşır.
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
        .select({
          email: users.email,
          full_name: users.full_name,
          auth_user_id: users.auth_user_id,
        })
        .from(users)
        .where(and(eq(users.id, id), eq(users.org_id, req.authOrgId)));
      if (!u) throw new HttpError(404, 'Çalışan bulunamadı');

      const supabase = getSupabaseAdmin();
      const redirectTo = `${env.CLIENT_URL ?? 'https://damga.deploi.net'}/auth/reset-password`;
      const { data: linkData, error: linkErr } =
        await supabase.auth.admin.generateLink({
          type: 'recovery',
          email: u.email,
          options: { redirectTo },
        });
      if (linkErr || !linkData?.properties?.action_link) {
        throw new HttpError(
          502,
          `Link üretilemedi: ${linkErr?.message ?? 'unknown'}`,
        );
      }
      res.json({
        ok: true,
        email: u.email,
        full_name: u.full_name,
        password_reset_link: linkData.properties.action_link,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/users/:id/set-password — admin doğrudan yeni şifre belirler.
 *
 * Body: { password?: string }
 *   - Verilmezse 14 karakterlik güçlü rastgele şifre üretilir
 *   - Verilirse en az 8 karakter olmalı
 *
 * Supabase admin.updateUserById(authUserId, { password }) çağırılır.
 * Yeni şifre **CLEAR TEXT olarak** response'da döner — admin kullanıcıya iletir.
 *
 * GÜVENLİK NOTU:
 *  - Audit log'a "admin X kullanıcı Y'nin şifresini değiştirdi" düşer
 *  - Mevcut şifre OKUNAMAZ (bcrypt hash, geri çevrilemez); sadece yenisi atanır
 *  - Bu işlem non-repudiation kaybına yol açabilir → kullanıcı ilk girişte
 *    şifre değiştirme yapması önerilir (bu UI tarafında not edilir)
 */
const setPasswordSchema = z.object({
  password: z.string().min(8, 'En az 8 karakter').max(72).optional(),
  /** Şifreyi otomatik gönder: 'show' (default, admin'e modal'da göster), 'sms', 'whatsapp' */
  send_via: z.enum(['show', 'sms', 'whatsapp']).optional(),
});

usersRouter.post(
  '/users/:id/set-password',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUser)
        throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const body = setPasswordSchema.parse(req.body ?? {});

      const [u] = await getDb()
        .select({
          email: users.email,
          phone: users.phone,
          full_name: users.full_name,
          auth_user_id: users.auth_user_id,
          role: users.role,
        })
        .from(users)
        .where(and(eq(users.id, id), eq(users.org_id, req.authOrgId)));
      if (!u) throw new HttpError(404, 'Çalışan bulunamadı');
      if (!u.auth_user_id) {
        throw new HttpError(
          400,
          'Bu kullanıcının auth hesabı yok',
          'NO_AUTH_USER',
        );
      }

      // Owner şifresini sadece owner değiştirebilir
      if (u.role === 'owner' && req.authUser.role !== 'owner') {
        throw new HttpError(
          403,
          'Owner şifresini sadece şirket sahibi değiştirebilir',
          'OWNER_ONLY',
        );
      }

      const sendVia = body.send_via ?? 'show';
      if ((sendVia === 'sms' || sendVia === 'whatsapp') && !u.phone) {
        throw new HttpError(
          400,
          'Bu kullanıcının kayıtlı telefonu yok. Profil bilgilerine telefon ekle veya "Göster" yöntemini kullan.',
          'NO_PHONE_ON_RECORD',
        );
      }

      const newPassword = body.password ?? generateStrongPassword(14);
      const generated = !body.password;

      const supabase = getSupabaseAdmin();
      const { error } = await supabase.auth.admin.updateUserById(
        u.auth_user_id,
        {
          password: newPassword,
        },
      );
      if (error) {
        throw new HttpError(502, `Şifre güncellenemedi: ${error.message}`);
      }

      // Şifreyi seçili kanaldan ilet — show: admin'e modal'da, sms/whatsapp: gateway veya fallback URL
      let delivery: {
        method: string;
        sent: boolean;
        fallback_url: string | null;
      } = {
        method: sendVia,
        sent: false,
        fallback_url: null,
      };
      if (sendVia !== 'show' && u.phone) {
        const signInUrl = `${env.CLIENT_URL ?? 'https://damga.deploi.net'}/auth/sign-in`;
        const message = buildPasswordMessage({
          recipientName: u.full_name,
          password: newPassword,
          signInUrl,
        });
        const result =
          sendVia === 'sms'
            ? await sendSms({ to: u.phone, message })
            : await sendWhatsApp({ to: u.phone, message });
        delivery = {
          method: sendVia,
          sent: result.sent,
          fallback_url: result.fallback_url ?? null,
        };
      }

      logger.info(
        {
          userId: id,
          by: req.authUserId,
          generated,
          send_via: sendVia,
          sent: delivery.sent,
        },
        'Admin kullanıcı şifresini değiştirdi',
      );

      res.json({
        ok: true,
        email: u.email,
        phone: u.phone,
        full_name: u.full_name,
        password: newPassword,
        generated,
        delivery,
      });
    } catch (err) {
      next(err);
    }
  },
);
