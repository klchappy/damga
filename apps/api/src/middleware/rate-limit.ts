import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Çok fazla istek', code: 'RATE_LIMITED' },
});

export const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Çok fazla auth denemesi', code: 'AUTH_RATE_LIMITED' },
});

/** Check-in: dakikada 6 (10sn'de bir) — anti-spam */
export const checkInLimiter = rateLimit({
  windowMs: 60_000,
  max: 6,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Çok hızlı check-in denemesi', code: 'CHECKIN_RATE_LIMITED' },
});
