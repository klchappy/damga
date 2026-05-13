import { z } from 'zod';

/**
 * Sirket basvurusu (yeni org talebi).
 * Basvuran kendi sifresini formda belirler; admin onayindan sonra ayni
 * e-posta/sifre ile owner olarak giris yapar.
 */
export const applyOrgSchema = z
  .object({
    org_name: z.string().trim().min(2, 'Sirket adi en az 2 karakter').max(120),
    tax_id: z
      .string()
      .trim()
      .regex(/^\d{10,11}$/, 'Vergi/TC kimlik no 10 veya 11 hane')
      .optional()
      .or(z.literal('')),
    industry: z.string().trim().max(60).optional(),
    employee_count_estimate: z.enum(['1-10', '11-50', '51-200', '200+']).optional(),

    applicant_full_name: z.string().trim().min(2).max(100),
    applicant_email: z.string().trim().email('Gecerli e-posta gir'),
    password: z.string().min(8, 'Sifre en az 8 karakter olmali').max(72),
    password_confirm: z.string().min(8, 'Sifre tekrarini gir'),
    applicant_phone: z
      .string()
      .trim()
      .regex(/^[\d\s\+\-\(\)]{7,20}$/, 'Gecerli telefon gir')
      .optional()
      .or(z.literal('')),
    applicant_title: z.string().trim().max(80).optional(),

    notes: z.string().trim().max(500).optional(),
    kvkk_consent: z.literal(true, {
      errorMap: () => ({ message: 'KVKK aydinlatma metnini onaylamalisin' }),
    }),
  })
  .refine((d) => d.password === d.password_confirm, {
    message: 'Sifreler eslesmiyor',
    path: ['password_confirm'],
  });
export type ApplyOrgInput = z.infer<typeof applyOrgSchema>;

/**
 * Calisan kaydi - mevcut bir org'a katilma.
 * Davet kodu varsa direkt o orga, yoksa admin onayi bekler (org_id=null, is_pending=true).
 */
export const employeeSignUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'En az 8 karakter').max(72),
  full_name: z.string().min(2).max(100),
  department: z.string().max(60).optional(),
  /** Sirket sahibi tarafindan paylasilan davet kodu (yoksa pending olur) */
  invite_code: z.string().trim().min(6).max(60).optional().or(z.literal('')),
  kvkk_consent: z.literal(true, {
    errorMap: () => ({ message: 'KVKK aydinlatma metnini onaylamalisin' }),
  }),
});
export type EmployeeSignUpInput = z.infer<typeof employeeSignUpSchema>;

/**
 * Admin basvuruyu onaylarken: rejection_reason opsiyonel.
 */
export const reviewApplicationSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  rejection_reason: z.string().max(500).optional(),
});
export type ReviewApplicationInput = z.infer<typeof reviewApplicationSchema>;

/**
 * Admin pending user'i bir org'a atar.
 */
export const assignUserOrgSchema = z.object({
  org_id: z.string().uuid(),
  role: z.enum(['employee', 'manager', 'admin', 'owner']).default('employee'),
  department: z.string().max(60).optional(),
});
export type AssignUserOrgInput = z.infer<typeof assignUserOrgSchema>;
