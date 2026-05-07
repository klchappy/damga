import { z } from 'zod';

export const magicLinkSchema = z.object({
  email: z.string().email('Geçerli bir e-posta gir'),
});
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;

export const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'En az 8 karakter').max(72),
  full_name: z.string().min(2).max(100),
  /** Davet kodu (org'a katılma için) — opsiyonel */
  invite_code: z.string().min(6).max(60).optional(),
  /** Yeni org açma — invite_code yoksa şirket adı zorunlu */
  org_name: z.string().min(2).max(100).optional(),
  kvkk_consent: z.literal(true, { errorMap: () => ({ message: 'KVKK aydınlatma metnini onaylamalısın' }) }),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Şifre gerekli'),
});
export type SignInInput = z.infer<typeof signInSchema>;

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
