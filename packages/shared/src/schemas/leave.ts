import { z } from 'zod';

export const createLeaveSchema = z
  .object({
    type: z.enum(['annual', 'sick', 'unpaid', 'maternity', 'paternity', 'compassionate']),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD formatı'),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD formatı'),
    half_day: z.boolean().default(false),
    reason: z.string().max(500).optional(),
  })
  .refine((d) => new Date(d.end_date) >= new Date(d.start_date), {
    message: 'Bitiş tarihi başlangıçtan önce olamaz',
    path: ['end_date'],
  });
export type CreateLeaveInput = z.infer<typeof createLeaveSchema>;

export const rejectLeaveSchema = z.object({
  rejection_reason: z.string().min(5, 'Red sebebi en az 5 karakter').max(500),
});
