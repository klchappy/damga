import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2).max(100),
  role: z.enum(['employee', 'manager', 'admin', 'owner']).default('employee'),
  department: z.string().max(80).optional(),
  title: z.string().max(80).optional(),
  hired_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  annual_leave_quota_days: z.number().int().min(0).max(60).default(14),
  /** Opsiyonel kullanıcı adı (3-32 char, [a-z0-9._-]) — sign-in'de email yerine */
  username: z
    .string()
    .regex(/^[a-z0-9._-]{3,32}$/i, 'Kullanıcı adı 3-32 karakter (harf/rakam/.-_)')
    .optional()
    .or(z.literal('')),
  /** Opsiyonel telefon (E.164: +905xxxxxxxxx) — SMS/WhatsApp adresi */
  phone: z
    .string()
    .regex(/^\+\d{10,15}$/, 'Telefon +905xx... (E.164) formatında olmalı')
    .optional()
    .or(z.literal('')),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export const inviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['employee', 'manager', 'admin']).default('employee'),
});
