import { z } from 'zod';
import { API_SCOPES } from '../constants';

export const createApiKeySchema = z.object({
  name: z.string().min(2).max(80),
  scopes: z.array(z.enum(API_SCOPES)).min(1),
  rate_limit_per_min: z.number().int().min(1).max(10_000).default(100),
  expires_at: z.string().datetime().optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z
    .array(
      z.enum([
        'check_in.created',
        'check_out.created',
        'leave.created',
        'leave.approved',
        'leave.rejected',
        'mood.created',
        'announcement.published',
        'user.created',
        'user.deactivated',
        'event.disputed',
        'event.edited',
      ]),
    )
    .min(1),
});
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
