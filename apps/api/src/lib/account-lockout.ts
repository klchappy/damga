/**
 * Account lockout — kullanıcı-bazlı brute force koruması.
 *
 * Senaryo: Saldırgan farklı IP'lerden aynı user'a şifre dener (distributed attack).
 * express-rate-limit IP-bazlı koruma yeterli değil.
 *
 * Kurallar:
 *   - Aynı identifier (case-insensitive) için son 15dk'da 5+ başarısız → 15 dk lock
 *   - Bu süre içinde her başarısız attempt lock süresini reset eder (sliding window)
 *   - Başarılı login → audit log düşer, sayım dolaylı sıfırlanır (15dk'lık pencere)
 *
 * Kullanım (auth route'larında):
 *   const lock = await checkLockout(identifier);
 *   if (lock.locked) throw new HttpError(429, lock.message, 'ACCOUNT_LOCKED');
 *   // ... şifre kontrolü ...
 *   if (passwordWrong) {
 *     await recordFailedAttempt({identifier, ip, ua, reason: 'invalid_password'});
 *     throw ...
 *   } else {
 *     await recordSuccessfulLogin({identifier, ip, ua}); // sadece audit
 *   }
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb, authFailedAttempts } from '@damga/db';
import { logger } from '../config/logger';

const LOCKOUT_THRESHOLD = 5; // 5 başarısız = lock
const LOCKOUT_WINDOW_MIN = 15; // son 15 dakika içinde
const LOCKOUT_DURATION_MIN = 15; // 15 dakika lock

interface LockCheckResult {
  locked: boolean;
  failed_count: number;
  unlock_at?: Date;
  message?: string;
}

export async function checkLockout(identifier: string): Promise<LockCheckResult> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MIN * 60 * 1000);
  const lower = identifier.trim().toLowerCase();

  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(authFailedAttempts)
    .where(
      and(
        sql`lower(${authFailedAttempts.identifier}) = ${lower}`,
        eq(authFailedAttempts.succeeded, false),
        gte(authFailedAttempts.attempted_at, since),
      ),
    );

  const count = row?.count ?? 0;
  if (count >= LOCKOUT_THRESHOLD) {
    // Son denemeden LOCKOUT_DURATION dakika sonrasına kadar lock
    const [latest] = await getDb()
      .select({ ts: authFailedAttempts.attempted_at })
      .from(authFailedAttempts)
      .where(
        and(
          sql`lower(${authFailedAttempts.identifier}) = ${lower}`,
          eq(authFailedAttempts.succeeded, false),
        ),
      )
      .orderBy(sql`attempted_at desc`)
      .limit(1);
    const unlockAt = latest?.ts
      ? new Date(latest.ts.getTime() + LOCKOUT_DURATION_MIN * 60 * 1000)
      : new Date(Date.now() + LOCKOUT_DURATION_MIN * 60 * 1000);
    if (unlockAt > new Date()) {
      const minLeft = Math.ceil((unlockAt.getTime() - Date.now()) / 60000);
      return {
        locked: true,
        failed_count: count,
        unlock_at: unlockAt,
        message: `Çok fazla başarısız giriş denemesi. Hesabın ${minLeft} dakika boyunca kilitli. Şifreni hatırlamıyorsan "Şifremi unuttum" linkini kullan.`,
      };
    }
  }
  return { locked: false, failed_count: count };
}

export async function recordFailedAttempt(args: {
  identifier: string;
  ip?: string | null;
  user_agent?: string | null;
  reason: 'invalid_password' | 'user_not_found' | 'mfa_failed' | 'rate_limited' | 'lockout';
}): Promise<void> {
  try {
    await getDb().insert(authFailedAttempts).values({
      identifier: args.identifier.trim().toLowerCase(),
      ip_address: args.ip ?? null,
      user_agent: args.user_agent ? args.user_agent.slice(0, 500) : null,
      succeeded: false,
      failure_reason: args.reason,
    });
  } catch (e) {
    logger.warn({ err: e, identifier: args.identifier }, 'recordFailedAttempt failed');
  }
}

export async function recordSuccessfulLogin(args: {
  identifier: string;
  ip?: string | null;
  user_agent?: string | null;
}): Promise<void> {
  try {
    await getDb().insert(authFailedAttempts).values({
      identifier: args.identifier.trim().toLowerCase(),
      ip_address: args.ip ?? null,
      user_agent: args.user_agent ? args.user_agent.slice(0, 500) : null,
      succeeded: true,
      failure_reason: null,
    });
  } catch (e) {
    logger.warn({ err: e }, 'recordSuccessfulLogin failed');
  }
}

/**
 * Eski (>30 gün) attempt'leri temizle. Cron'da çağrılır.
 */
export async function cleanupOldAttempts(): Promise<number> {
  const result = await getDb().execute(
    sql`DELETE FROM public.auth_failed_attempts WHERE attempted_at < now() - interval '30 days'`,
  );
  const count = (result as unknown as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) {
    logger.info({ deleted: count }, '🧹 Eski auth_failed_attempts silindi');
  }
  return count;
}
