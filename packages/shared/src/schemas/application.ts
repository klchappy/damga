import { z } from 'zod';

/**
 * Şirket başvurusu (yeni org talebi).
 * Admin onayı sonrası org + owner kullanıcı oluşturulur.
 */
export const applyOrgSchema = z.object({
  org_name: z.string().trim().min(2, 'Şirket adı en az 2 karakter').max(120),
  tax_id: z
    .string()
    .trim()
    .regex(/^\d{10,11}$/, 'Vergi/TC kimlik no 10 veya 11 hane')
    .optional()
    .or(z.literal('')),
  industry: z.string().trim().max(60).optional(),
  employee_count_estimate: z
    .enum(['1-10', '11-50', '51-200', '200+'])
    .optional(),

  applicant_full_name: z.string().trim().min(2).max(100),
  applicant_email: z.string().trim().email('Geçerli e-posta gir'),
  applicant_phone: z
    .string()
    .trim()
    .regex(/^[\d\s\+\-\(\)]{7,20}$/, 'Geçerli telefon gir')
    .optional()
    .or(z.literal('')),
  applicant_title: z.string().trim().max(80).optional(),

  notes: z.string().trim().max(500).optional(),
  kvkk_consent: z.literal(true, {
    errorMap: () => ({ message: 'KVKK aydınlatma metnini onaylamalısın' }),
  }),
});
export type ApplyOrgInput = z.infer<typeof applyOrgSchema>;

/**
 * Çalışan kaydı — mevcut bir org'a katılma.
 * Davet kodu varsa direkt o orga, yoksa admin onayı bekler (org_id=null, is_pending=true).
 */
export const employeeSignUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'En az 8 karakter').max(72),
  full_name: z.string().min(2).max(100),
  department: z.string().max(60).optional(),
  /** Şirket sahibi tarafından paylaşılan davet kodu (yoksa pending olur) */
  invite_code: z.string().trim().min(6).max(60).optional().or(z.literal('')),
  kvkk_consent: z.literal(true, {
    errorMap: () => ({ message: 'KVKK aydınlatma metnini onaylamalısın' }),
  }),
});
export type EmployeeSignUpInput = z.infer<typeof employeeSignUpSchema>;

/**
 * Admin başvuruyu onaylarken: rejection_reason opsiyonel.
 */
export const reviewApplicationSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  rejection_reason: z.string().max(500).optional(),
});
export type ReviewApplicationInput = z.infer<typeof reviewApplicationSchema>;

/**
 * Admin pending user'ı bir org'a atar.
 */
export const assignUserOrgSchema = z.object({
  org_id: z.string().uuid(),
  role: z.enum(['employee', 'manager', 'admin', 'owner']).default('employee'),
  department: z.string().max(60).optional(),
});
export type AssignUserOrgInput = z.infer<typeof assignUserOrgSchema>;
