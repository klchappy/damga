import { z } from 'zod';
import { MOOD_EMOJIS } from '../constants';

export const createMoodSchema = z.object({
  emoji: z.enum(MOOD_EMOJIS),
});
export type CreateMoodInput = z.infer<typeof createMoodSchema>;

export const createStatusSchema = z.object({
  status_type: z.enum([
    'running_late',
    'on_lunch',
    'sick',
    'wfh',
    'in_focus',
    'on_business',
    'on_break',
  ]),
  note: z.string().max(160).optional(),
  /** ISO datetime; verilmezse gün sonuna kadar */
  expires_at: z.string().datetime().optional(),
});
export type CreateStatusInput = z.infer<typeof createStatusSchema>;
