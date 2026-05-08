import { z } from 'zod';

const slugRegex = /^[a-z0-9-]+$/;

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(slugRegex, 'sadece küçük harf, rakam ve tire')
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, '#RRGGBB formatında olmalı')
    .default('#FF6B35'),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = createDepartmentSchema.partial();
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

/**
 * Admin'in çalışan üzerinde değiştirebileceği alanlar.
 * Şifre sıfırlama ayrı (Supabase Admin API üzerinden).
 */
export const adminUpdateUserSchema = z.object({
  full_name: z.string().min(2).max(100).optional(),
  role: z.enum(['employee', 'manager', 'admin', 'owner']).optional(),
  department: z.string().max(60).nullable().optional(),
  title: z.string().max(120).nullable().optional(),
  hired_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  annual_leave_quota_days: z.number().int().min(0).max(365).optional(),
  is_active: z.boolean().optional(),
});
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
