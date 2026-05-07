import { z } from 'zod';

export const createMenuSchema = z.object({
  location_id: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  main_dish: z.string().min(2).max(150),
  description: z.string().max(500).optional(),
  photo_url: z.string().url().optional(),
  calories: z.number().int().nonnegative().max(5000).optional(),
  allergens: z.array(z.string()).default([]),
  is_vegetarian: z.boolean().default(false),
  is_vegan: z.boolean().default(false),
});
export type CreateMenuInput = z.infer<typeof createMenuSchema>;

export const rsvpSchema = z.object({
  will_eat: z.boolean(),
});

export const rateMenuSchema = z.object({
  rating: z.number().int().min(1).max(5),
});

export const createAnnouncementSchema = z.object({
  category: z.enum(['info', 'celebration', 'warning', 'urgent']).default('info'),
  title: z.string().min(2).max(150),
  body: z.string().min(2).max(2000),
  target_user_ids: z.array(z.string().uuid()).default([]),
  pinned: z.boolean().default(false),
  expires_at: z.string().datetime().optional(),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
