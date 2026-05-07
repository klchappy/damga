import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import {
  signUpSchema,
  magicLinkSchema,
} from '@damga/shared';
import { getDb, users, orgs } from '@damga/db';
import { env, isConfigured } from '../config/env';
import { HttpError } from '../middleware/error';
import { requireAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rate-limit';
import { logger } from '../config/logger';

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
 * Sign-up: kullanıcı + (yeni org veya invite ile mevcut org'a) katılır.
 * Supabase Auth'ta kullanıcı oluşturulur, sonra Damga DB'sine profile yazılır.
 */
authRouter.post('/sign-up', async (req, res, next) => {
  try {
    const input = signUpSchema.parse(req.body);
    const db = getDb();

    // Email kullanılıyor mu?
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    if (existing) {
      throw new HttpError(409, 'Bu e-posta zaten kayıtlı', 'EMAIL_EXISTS');
    }

    // Org belirle (invite veya yeni)
    let orgId: string | null = null;
    let role: 'owner' | 'employee' = 'employee';

    if (input.invite_code) {
      // TODO: invite_code parse et + org bul (invitation tablosu eklenecek)
      throw new HttpError(501, 'Davet kodu sistemi henüz aktif değil', 'NOT_IMPLEMENTED');
    } else if (input.org_name) {
      const slug = input.org_name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
      const [newOrg] = await db
        .insert(orgs)
        .values({
          name: input.org_name,
          slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
          plan: 'free',
          kvkk_consent_text: input.org_name + ' aydınlatma metni — düzenlenecek.',
        })
        .returning();
      orgId = newOrg!.id;
      role = 'owner';
    } else {
      throw new HttpError(400, 'Şirket adı veya davet kodu gerekli', 'ORG_REQUIRED');
    }

    // Supabase Auth'ta kullanıcı oluştur
    const supabase = getSupabaseAdmin();
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: false, // Email confirm akışı
      user_metadata: { full_name: input.full_name },
    });
    if (authErr || !authData.user) {
      throw new HttpError(400, authErr?.message ?? 'Auth oluşturma hatası', 'AUTH_CREATE_FAILED');
    }

    // Damga DB profile
    const [user] = await db
      .insert(users)
      .values({
        org_id: orgId,
        auth_user_id: authData.user.id,
        email: input.email,
        full_name: input.full_name,
        role,
      })
      .returning();

    // Supabase admin.createUser zaten email_confirm: false ile çağrıldı.
    // Confirmation email Supabase'in dahili email template'leri ile gönderilir
    // (Auth → Email Templates → Confirm signup).

    logger.info({ userId: user!.id, orgId }, 'Yeni kullanıcı + org oluşturuldu');

    res.status(201).json({
      user: {
        id: user!.id,
        email: user!.email,
        full_name: user!.full_name,
        role: user!.role,
        org_id: user!.org_id,
      },
      requires_email_confirmation: true,
    });
  } catch (err) {
    next(err);
  }
});

/** Mevcut kullanıcı (JWT ile) */
authRouter.get('/me', requireAuth, (req, res) => {
  if (!req.authUser) {
    throw new HttpError(401, 'Yetki yok');
  }
  const u = req.authUser;
  res.json({
    user: {
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      org_id: u.org_id,
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
  });
});
