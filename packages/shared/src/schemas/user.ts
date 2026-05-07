import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2).max(100),
  role: z.enum(['employee', 'manager', 'admin', 'owner']).default('employee'),
  department: z.string().max(80).optional(),
  title: z.string().max(80).optional(),
  hired_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  annual_leave_quota_days: z.number().int().min(0).max(60).default(14),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export const inviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['employee', 'manager', 'admin']).default('employee'),
});
