import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/**
 * Genel API limiter — /v1/* tümüne uygulanır.
 * Default: 60sn'de 300 istek (auth'lu kullanıcı için sayfa açılışında 10-15
 * paralel query atılabilir; bunu rahat karşılar).
 */
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  // Default'u env'de yoksa 300'e çek
  max: env.RATE_LIMIT_MAX < 300 ? 300 : env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Çok fazla istek', code: 'RATE_LIMITED' },
});

/**
 * Sensitif auth POST'larına özel limiter — sadece sign-up, sign-in,
 * magic-link, forgot, resolve-identifier gibi brute-force riskli POST'lara
 * uygulanır. /auth/me ve diğer GET'ler MUAFTIR (sayfa yüklenmesinde sürekli
 * çağrılır, legitimate trafiği bloklamamak için).
 *
 * 60sn'de 30 istek — yanlış şifre + birkaç tab açma + sayfa yenileme için
 * yeterince geniş, ama brute-force'a yine kapalı.
 */
export const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
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
