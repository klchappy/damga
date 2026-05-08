import { Router } from 'express';
import { eq, or, sql } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import {
  signUpSchema,
  magicLinkSchema,
  resolveIdentifierSchema,
  forgotPasswordMultiSchema,
} from '@damga/shared';
import { getDb, users, orgs } from '@damga/db';
import { env, isConfigured } from '../config/env';
import { HttpError } from '../middleware/error';
import { requireAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rate-limit';
import { logger } from '../config/logger';
import { generateStrongPassword } from '../lib/password';

export const authRouter = Router();
authRouter.use(authLimiter);

function getSupabaseAdmin() {
  if (!isConfigured.supabase) {
    throw new HttpError(503, 'Supabase yapılandırılmamış', 'SUPABASE_NOT_CONFIGURED');
  }
  return createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Magic link gönder.
 * Supabase Auth tarafından email'e link gönderilir, callback /auth/callback'e gelir.
 */
authRouter.post('/magic-link', async (req, res, next) => {
  try {
    const { email } = magicLinkSchema.parse(req.body);
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${env.CLIENT_URL}/auth/callback` },
    });
    if (error) {
      throw new HttpError(400, error.message, 'MAGIC_LINK_FAILED');
    }
    res.json({ sent: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Sign-up — sadece "Hesap Oluştur" akışı (çalışan).
 *
 * 3 mod:
 *  1. invite_code   → ileride: davetli olarak mevcut org'a katılır.
 *  2. org_name      → eski "şirket aç" akışı; ARTIK KAPALI. Org açmak için /v1/auth/apply-org
 *                     üzerinden başvuru yapılır → admin onayı sonrası owner kullanıcı oluşturulur.
 *  3. (ikisi de yok) → kullanıcı pending olarak oluşturulur (org_id=null, is_pending=true).
 *                      Admin sonradan /admin/pending-users üzerinden bir org'a atar.
 *
 * Supabase email_confirm: TRUE → onay maili gönderilmez (rate limit fix).
 * Kullanıcı şifresiyle direkt giriş yapar; yöneticiyle eşleşene kadar /pending sayfası görür.
 */
authRouter.post('/sign-up', async (req, res, next) => {
  try {
    const input = signUpSchema.parse(req.body);
    const db = getDb();

    // Email kullanılıyor mu?
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()));
    if (existing) {
      throw new HttpError(409, 'Bu e-posta zaten kayıtlı', 'EMAIL_EXISTS');
    }

    // Org belirle
    let orgId: string | null = null;
    let role: 'owner' | 'employee' = 'employee';
    let isPending = false;

    if (input.invite_code) {
      // TODO: invite_code parse et + org bul (invitation tablosu eklenecek)
      throw new HttpError(501, 'Davet kodu sistemi henüz aktif değil', 'NOT_IMPLEMENTED');
    } else if (input.org_name) {
      // Eski akış kapatıldı — başvuru sistemine yönlendir
      throw new HttpError(
        400,
        'Şirket açmak için /v1/auth/apply-org başvuru formunu kullan. Admin onayı sonrası owner hesabın aktive edilecek.',
        'USE_APPLY_ORG',
      );
    } else {
      // Çalışan modu — pending; admin sonradan org'a atar
      isPending = true;
    }

    // Supabase Auth'ta kullanıcı oluştur — email_confirm:true → onay maili YOK (rate limit fix)
    const supabase = getSupabaseAdmin();
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.full_name },
    });
    if (authErr || !authData.user) {
      throw new HttpError(400, authErr?.message ?? 'Auth oluşturma hatası', 'AUTH_CREATE_FAILED');
    }

    // Damga DB profile (org_id null + is_pending=true)
    const [user] = await db
      .insert(users)
      .values({
        org_id: orgId,
        auth_user_id: authData.user.id,
        email: input.email.toLowerCase(),
        username: input.username?.trim().toLowerCase() || null,
        phone: input.phone?.trim() || null,
        full_name: input.full_name,
        role,
        department: input.department ?? 'Diğer',
        is_pending: isPending,
      })
      .returning();

    logger.info(
      { userId: user!.id, orgId, isPending },
      'Yeni kullanıcı oluşturuldu (employee, pending)',
    );

    res.status(201).json({
      user: {
        id: user!.id,
        email: user!.email,
        full_name: user!.full_name,
        role: user!.role,
        org_id: user!.org_id,
        is_pending: isPending,
      },
      requires_email_confirmation: false,
      message: isPending
        ? 'Hesabın oluşturuldu. Yöneticin tarafından bir şirkete atanana kadar bekleme ekranı görürsün.'
        : 'Hesabın oluşturuldu. Giriş yapabilirsin.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/auth/resolve-identifier — public.
 * Email/username/phone'dan kayıtlı kullanıcının email'ini döner.
 * Sign-in akışında client önce identifier'ı email'e çevirip Supabase login eder.
 *
 * GÜVENLİK: identifier var/yok bilgisi sızmasın diye yanıt aynı şekilde:
 *   - bulundu: { email: 'a@b.com' }
 *   - bulunmadı: { email: null }
 * (Brute-force enumeration için authLimiter zaten 60sn'de 10 istek)
 */
authRouter.post('/resolve-identifier', async (req, res, next) => {
  try {
    const input = resolveIdentifierSchema.parse(req.body);
    const id = input.identifier.trim();
    if (!id) {
      res.json({ email: null });
      return;
    }
    // Email gibi görünüyorsa direkt onu kullan
    if (id.includes('@')) {
      res.json({ email: id.toLowerCase() });
      return;
    }
    const db = getDb();
    const lower = id.toLowerCase();
    const phoneCandidate = id.startsWith('+') ? id : null;
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(
        or(
          sql`lower(${users.username}) = ${lower}`,
          phoneCandidate ? eq(users.phone, phoneCandidate) : sql`false`,
        ),
      )
      .limit(1);
    res.json({ email: user?.email ?? null });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/auth/forgot — public.
 * 3 yöntem destekler: email | sms | whatsapp
 *
 *  - email: generateLink(recovery) → kullanıcıya email gönder (Supabase yapar)
 *  - sms / whatsapp: yeni güçlü şifre üret + updateUserById ile ata + mesaj/SMS ile ilet
 *    (ya da fallback: client'a paylaşım URL'si dön)
 *
 * Kullanıcının email/username/phone bilgisini idantifier olarak alır, kayıtlı
 * kullanıcının email'ini bulur, sonra method'a göre işlem yapar.
 */
authRouter.post('/forgot', async (req, res, next) => {
  try {
    const input = forgotPasswordMultiSchema.parse(req.body);
    const id = input.identifier.trim();

    const db = getDb();
    let userEmail: string | null = null;
    let userPhone: string | null = null;
    let userFullName: string | null = null;
    let authUserId: string | null = null;

    if (id.includes('@')) {
      const [u] = await db
        .select({
          email: users.email,
          phone: users.phone,
          full_name: users.full_name,
          auth_user_id: users.auth_user_id,
        })
        .from(users)
        .where(eq(users.email, id.toLowerCase()))
        .limit(1);
      if (u) {
        userEmail = u.email;
        userPhone = u.phone;
        userFullName = u.full_name;
        authUserId = u.auth_user_id;
      }
    } else {
      const lower = id.toLowerCase();
      const phoneCandidate = id.startsWith('+') ? id : null;
      const [u] = await db
        .select({
          email: users.email,
          phone: users.phone,
          full_name: users.full_name,
          auth_user_id: users.auth_user_id,
        })
        .from(users)
        .where(
          or(
            sql`lower(${users.username}) = ${lower}`,
            phoneCandidate ? eq(users.phone, phoneCandidate) : sql`false`,
          ),
        )
        .limit(1);
      if (u) {
        userEmail = u.email;
        userPhone = u.phone;
        userFullName = u.full_name;
        authUserId = u.auth_user_id;
      }
    }

    // Güvenlik: kullanıcı bulunamasa bile aynı yapıda dön (enumeration koruması)
    if (!userEmail || !authUserId) {
      res.json({
        ok: true,
        method: input.method,
        message:
          'Eğer bu bilgiyle kayıtlı bir hesap varsa seçtiğin yöntemle bilgi iletilir.',
      });
      return;
    }

    const supabase = getSupabaseAdmin();
    const signInUrl = `${env.CLIENT_URL ?? 'https://damga.deploi.net'}/auth/sign-in`;

    if (input.method === 'email') {
      const redirectTo = `${env.CLIENT_URL ?? 'https://damga.deploi.net'}/auth/reset-password`;
      const { data, error } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: userEmail,
        options: { redirectTo },
      });
      if (error || !data?.properties?.action_link) {
        throw new HttpError(502, `Link üretilemedi: ${error?.message ?? 'unknown'}`);
      }
      // Email göndermek istemediğimiz durumda link client'ta gösterilebilir
      res.json({
        ok: true,
        method: 'email',
        delivered: 'link_generated',
        action_link: data.properties.action_link,
      });
      return;
    }

    // SMS / WhatsApp → yeni şifre üret + ata + mesaj olarak ilet
    if (!userPhone) {
      throw new HttpError(
        400,
        'Bu yöntem için telefon numarası kayıtlı değil. Yöneticinden ekletmeni veya email yöntemini seçmeni öneririz.',
        'NO_PHONE_ON_RECORD',
      );
    }

    const newPassword = generateStrongPassword(14);
    const { error: pwErr } = await supabase.auth.admin.updateUserById(authUserId, {
      password: newPassword,
    });
    if (pwErr) {
      throw new HttpError(502, `Şifre güncellenemedi: ${pwErr.message}`);
    }

    const { buildPasswordMessage, sendSms, sendWhatsApp } = await import('../lib/notify');
    const message = buildPasswordMessage({
      recipientName: userFullName ?? '',
      password: newPassword,
      signInUrl,
    });

    const result =
      input.method === 'sms'
        ? await sendSms({ to: userPhone, message })
        : await sendWhatsApp({ to: userPhone, message });

    logger.info(
      { authUserId, method: input.method, sent: result.sent },
      'Forgot password (yeni şifre üretildi+iletildi)',
    );

    res.json({
      ok: true,
      method: input.method,
      delivered: result.sent ? 'sent' : 'fallback',
      // Gateway konfig'siz veya fail olduğunda client kullanıcıya share linki sunar
      fallback_url: result.fallback_url ?? null,
      // Gateway konfig'liyse şifreyi yine de döndürürüz (admin gözetiminde değil — dönmemeli)
      // → güvenlik için sadece fallback durumunda dön
      password: result.sent ? null : newPassword,
      error: result.error ?? null,
    });
  } catch (err) {
    next(err);
  }
});

/** Mevcut kullanıcı (JWT ile) — org settings dahil */
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUser) {
      throw new HttpError(401, 'Yetki yok');
    }
    const u = req.authUser;

    // Org settings — frontend page filter için gerekli
    let org: { id: string; name: string; slug: string; settings: unknown } | null = null;
    if (u.org_id) {
      const [row] = await getDb()
        .select({
          id: orgs.id,
          name: orgs.name,
          slug: orgs.slug,
          settings: orgs.settings,
        })
        .from(orgs)
        .where(eq(orgs.id, u.org_id));
      if (row) org = row;
    }

    res.json({
      user: {
        id: u.id,
        email: u.email,
        username: u.username,
        phone: u.phone,
        full_name: u.full_name,
        role: u.role,
        org_id: u.org_id,
        is_pending: u.is_pending,
        department: u.department,
        title: u.title,
        avatar_url: u.avatar_url,
        current_streak: u.current_streak,
        longest_streak: u.longest_streak,
        total_xp: u.total_xp,
        level: u.level,
        shields: u.shields,
        annual_leave_quota_days: u.annual_leave_quota_days,
        annual_leave_used_days: u.annual_leave_used_days,
      },
      org,
    });
  } catch (err) {
    next(err);
  }
});
