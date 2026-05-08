import { z } from 'zod';

export const magicLinkSchema = z.object({
  email: z.string().email('Geçerli bir e-posta gir'),
});
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;

/** Telefon E.164: +905xxxxxxxxx (TR) veya +<ülke kodu><numara> */
const phoneRegex = /^\+\d{10,15}$/;
const usernameRegex = /^[a-z0-9._-]{3,32}$/i;

export const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'En az 8 karakter').max(72),
  full_name: z.string().min(2).max(100),
  /** Opsiyonel kullanıcı adı (3-32 char, [a-z0-9._-]) */
  username: z.string().regex(usernameRegex, 'Kullanıcı adı 3-32 karakter (harf/rakam/.-_)').optional().or(z.literal('')),
  /** Opsiyonel telefon (+905xxxxxxxxx) */
  phone: z.string().regex(phoneRegex, 'Telefon +905xx... (E.164) formatında olmalı').optional().or(z.literal('')),
  /** Davet kodu (org'a katılma için) — opsiyonel */
  invite_code: z.string().min(6).max(60).optional(),
  /** Yeni org açma — invite_code yoksa şirket adı zorunlu */
  org_name: z.string().min(2).max(100).optional(),
  /** Departman adı (sign-up sırasında seçilir; yeni org açılıyorsa default 'Diğer') */
  department: z.string().max(60).optional(),
  kvkk_consent: z.literal(true, { errorMap: () => ({ message: 'KVKK aydınlatma metnini onaylamalısın' }) }),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

/** Sign-in: email VEYA username VEYA phone — tek alan "identifier" */
export const signInSchema = z.object({
  /** E-posta, kullanıcı adı veya telefon */
  identifier: z.string().min(1, 'E-posta, kullanıcı adı veya telefon girmelisin'),
  password: z.string().min(1, 'Şifre gerekli'),
});
export type SignInInput = z.infer<typeof signInSchema>;

/** Identifier resolve — email/username/phone'dan email lookup yapan endpoint için */
export const resolveIdentifierSchema = z.object({
  identifier: z.string().min(1).max(120),
});
export type ResolveIdentifierInput = z.infer<typeof resolveIdentifierSchema>;

/** Şifre sıfırlama yöntemi: email/whatsapp/sms (kullanıcı seçer) */
export const forgotPasswordMultiSchema = z.object({
  identifier: z.string().min(1).max(120),
  method: z.enum(['email', 'whatsapp', 'sms']),
});
export type ForgotPasswordMultiInput = z.infer<typeof forgotPasswordMultiSchema>;

export { phoneRegex, usernameRegex };

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8).max(72),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Şifreler eşleşmiyor',
    path: ['confirm'],
  });
