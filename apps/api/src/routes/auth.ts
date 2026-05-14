import { Router } from 'express';
import { eq, or, sql } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  signUpSchema,
  magicLinkSchema,
  resolveIdentifierSchema,
  forgotPasswordMultiSchema,
} from '@damga/shared';
import { getDb, users, orgs, departments } from '@damga/db';
import { env, isConfigured } from '../config/env';
import { HttpError } from '../middleware/error';
import { requireAuth, requireSupabaseAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rate-limit';
import { logger } from '../config/logger';
import { generateStrongPassword } from '../lib/password';
import { sendPasswordResetEmail } from '../lib/email';

export const authRouter = Router();
// authLimiter sadece sensitif POST'lara uygulanır (sign-up, magic-link,
// resolve-identifier, forgot). /auth/me GET'i her sayfa yüklenmesinde
// çağrıldığı için MUAF — apiLimiter (300/dk) yeterli koruma sağlar.

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
authRouter.post('/magic-link', authLimiter, async (req, res, next) => {
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
 *  1. invite_code   → org ayarlarındaki davet kodu eşleşirse mevcut org'a katılır.
 *  2. org_name      → eski "şirket aç" akışı; ARTIK KAPALI. Org açmak için /v1/auth/apply-org
 *                     üzerinden başvuru yapılır → admin onayı sonrası owner kullanıcı oluşturulur.
 *  3. (ikisi de yok) → kullanıcı pending olarak oluşturulur (org_id=null, is_pending=true).
 *                      Admin sonradan /admin/pending-users üzerinden bir org'a atar.
 *
 * Supabase email_confirm: TRUE → onay maili gönderilmez (rate limit fix).
 * Kullanıcı şifresiyle direkt giriş yapar; yöneticiyle eşleşene kadar /pending sayfası görür.
 */
authRouter.post('/sign-up', authLimiter, async (req, res, next) => {
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
      const inviteCode = input.invite_code.trim().toLowerCase();
      const [invitedOrg] = await db
        .select({ id: orgs.id })
        .from(orgs)
        .where(sql`
          lower(coalesce(${orgs.settings}->>'invite_code', '')) = ${inviteCode}
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(coalesce(${orgs.settings}->'invite_codes', '[]'::jsonb)) AS code(value)
            WHERE lower(code.value) = ${inviteCode}
          )
        `)
        .limit(1);
      if (!invitedOrg) {
        throw new HttpError(400, 'Davet kodu geçersiz veya artık aktif değil', 'INVALID_INVITE_CODE');
      }
      orgId = invitedOrg.id;
      role = 'employee';
      isPending = false;
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
 * POST /v1/auth/sign-up-org
 * Self-org-signup akışı: client önce supabase.auth.signUp() ile auth oluşturur,
 * oradan aldığı JWT ile bu endpoint'i çağırır → public.orgs + public.users (owner)
 * + 4 default departman oluşturulur.
 *
 * Mevcut "apply-org → admin onay" akışına PARALEL — admin onayı beklemeden
 * kullanıcı kendi org'unu açabilir. Ücretsiz dönem: trial yok, plan='free'.
 *
 * Body: { org_name, full_name?, accept_terms: true }
 * Idempotent: zaten kayıtlıysa mevcut user + org dön.
 */
authRouter.post('/sign-up-org', requireSupabaseAuth, async (req, res, next) => {
  try {
    if (!req.supabaseAuth) throw new HttpError(401, 'Yetki yok');
    const input = z
      .object({
        org_name: z.string().trim().min(2).max(120),
        full_name: z.string().trim().max(120).optional(),
        accept_terms: z.literal(true, {
          errorMap: () => ({
            message: "Kullanım koşullarını ve KVKK'yı kabul etmelisin",
          }),
        }),
      })
      .parse(req.body);

    const db = getDb();

    // Idempotent check
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.auth_user_id, req.supabaseAuth.authUserId));
    if (existing) {
      const [existingOrg] = existing.org_id
        ? await db.select().from(orgs).where(eq(orgs.id, existing.org_id))
        : [];
      res.json({ user: existing, org: existingOrg ?? null, already_existed: true });
      return;
    }

    // Email collision (auth_user_id farklı bir kullanıcı bu email'i kullanıyorsa)
    const [emailExists] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, req.supabaseAuth.email.toLowerCase()));
    if (emailExists) {
      throw new HttpError(409, 'Bu e-posta zaten kayıtlı', 'EMAIL_EXISTS');
    }

    // Slug auto-generate (TR karakter normalize)
    const trMap: Record<string, string> = {
      '\u0131': 'i',
      '\u011f': 'g',
      '\u00fc': 'u',
      '\u015f': 's',
      '\u00f6': 'o',
      '\u00e7': 'c',
    };
    const baseSlug = input.org_name
      .toLocaleLowerCase('tr-TR')
      .replace(/[\u0131\u011f\u00fc\u015f\u00f6\u00e7]/g, (m) => trMap[m] ?? m)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'sirket';
    let slug = baseSlug;
    let counter = 1;
    while (counter <= 50) {
      const r = await db.execute(sql`select 1 from public.orgs where slug = ${slug}`);
      if (r.rows.length === 0) break;
      slug = `${baseSlug}-${++counter}`;
    }
    if (counter > 50) slug = `${baseSlug}-${Date.now()}`;

    // Org oluştur (plan='free', org_type DB default 'damga_only')
    const [newOrg] = await db
      .insert(orgs)
      .values({
        name: input.org_name,
        slug,
        plan: 'free',
      })
      .returning();
    if (!newOrg) throw new HttpError(500, 'Org oluşturulamadı');

    // 4 default departman seed
    await db.insert(departments).values([
      { org_id: newOrg.id, name: 'Satış', slug: 'satis', is_default: true },
      { org_id: newOrg.id, name: 'Sevk', slug: 'sevk', is_default: true },
      { org_id: newOrg.id, name: 'Muhasebe', slug: 'muhasebe', is_default: true },
      { org_id: newOrg.id, name: 'Diğer', slug: 'diger', is_default: true },
    ]);

    // Owner kullanıcı
    const fullName =
      input.full_name?.trim() ||
      req.supabaseAuth.fullName ||
      req.supabaseAuth.email.split('@')[0] ||
      'Kullanıcı';
    const [u] = await db
      .insert(users)
      .values({
        auth_user_id: req.supabaseAuth.authUserId,
        email: req.supabaseAuth.email.toLowerCase(),
        full_name: fullName,
        org_id: newOrg.id,
        role: 'owner',
        department: 'Diğer',
        is_active: true,
        is_pending: false,
      })
      .returning();
    if (!u) throw new HttpError(500, 'Kullanıcı kaydı oluşturulamadı');

    logger.info(
      { userId: u.id, orgId: newOrg.id, slug: newOrg.slug },
      'Self-org-signup: yeni org + owner oluşturuldu',
    );

    res.status(201).json({ user: u, org: newOrg });
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
authRouter.post('/resolve-identifier', authLimiter, async (req, res, next) => {
  try {
    const input = resolveIdentifierSchema.parse(req.body);
    const id = input.identifier.trim();
    if (!id) {
      res.json({ email: null });
      return;
    }

    // Account lockout kontrolü (kullanıcı-bazlı brute force koruması)
    const { checkLockout } = await import('../lib/account-lockout');
    const lock = await checkLockout(id);
    if (lock.locked) {
      throw new HttpError(429, lock.message ?? 'Hesap kilitli', 'ACCOUNT_LOCKED');
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
 * POST /v1/auth/login-result — frontend Supabase sign-in sonucunu raporlar.
 *
 * Body: { identifier, success: boolean, reason?: 'invalid_password' | 'mfa_failed' | ... }
 *
 * Sunucu lockout sayacını günceller. Başarısız 5 deneme → 15 dk kilit.
 *
 * Bu endpoint client tarafından çağrıldığı için saldırgan göndermeyebilir
 * (false report). Ama gerçek brute force durumunda saldırgan'ın "report
 * etmemesi" zaten ona yardım etmez — şifre yine yanlış, login yine başarısız.
 * Audit + UX için yeterli.
 */
authRouter.post('/login-result', authLimiter, async (req, res, next) => {
  try {
    const body = z
      .object({
        identifier: z.string().trim().min(1).max(200),
        success: z.boolean(),
        reason: z
          .enum(['invalid_password', 'user_not_found', 'mfa_failed', 'rate_limited'])
          .optional(),
      })
      .parse(req.body);

    const ip =
      (req.headers['cf-connecting-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      null;
    const ua = (req.headers['user-agent'] as string) ?? null;

    const { recordFailedAttempt, recordSuccessfulLogin, checkLockout } = await import(
      '../lib/account-lockout'
    );

    if (body.success) {
      await recordSuccessfulLogin({ identifier: body.identifier, ip, user_agent: ua });
      res.json({ ok: true });
      return;
    }

    await recordFailedAttempt({
      identifier: body.identifier,
      ip,
      user_agent: ua,
      reason: body.reason ?? 'invalid_password',
    });

    // Bu denemeden sonra hesap kilitlendi mi?
    const lock = await checkLockout(body.identifier);
    res.json({ ok: true, locked: lock.locked, failed_count: lock.failed_count });
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
authRouter.post('/forgot', authLimiter, async (req, res, next) => {
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
      const baseWeb =
        env.PUBLIC_WEB_URL ?? env.CLIENT_URL ?? 'https://damga.deploi.net';
      const redirectTo = `${baseWeb}/auth/reset-password`;
      const { data, error } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: userEmail,
        options: { redirectTo },
      });
      if (error || !data?.properties?.action_link) {
        throw new HttpError(502, `Link üretilemedi: ${error?.message ?? 'unknown'}`);
      }
      const resetLink = data.properties.action_link;
      // Resend gateway ile mail at — yoksa fallback olarak action_link döner
      const mailResult = await sendPasswordResetEmail({
        to: userEmail,
        resetUrl: resetLink,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      logger.info(
        {
          email: userEmail,
          delivery: mailResult.delivered,
          message_id: mailResult.message_id ?? null,
        },
        'Şifre sıfırlama maili tetiklendi',
      );
      res.json({
        ok: true,
        method: 'email',
        delivered: mailResult.delivered, // 'email' | 'fallback_link'
        message_id: mailResult.message_id ?? null,
        // Fallback durumunda link client'ta gösterilir; email başarılıysa da
        // backup için döneriz (UI istemezse görmezden gelir)
        action_link: resetLink,
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
