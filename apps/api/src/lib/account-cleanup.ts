/**
 * KVKK md.11 — Hesap silme cron job'u.
 *
 * Günlük 04:00 (TR) çalışır:
 *   1. `deletion_scheduled_at < now()` + `deleted_at IS NULL` olan kullanıcıları bul
 *      → Anonymize et: full_name='[Silinmiş Kullanıcı]', email→null, phone→null,
 *        username→null, avatar_url→null, deleted_at=now()
 *      → Supabase auth.users → silinir (auth_user_id kalır audit için ama Supabase'den
 *        silindiği için artık login mümkün değil)
 *
 *   2. `deleted_at < now() - 60 gün` olan kullanıcıları hard delete et (CASCADE)
 *      → attendance_events, leaves, vs. tümü CASCADE ile gider
 *      → Audit log için anonymized_user_id text field'ı korunur (eğer eklenirse)
 *
 * Bu sistem KVKK md.11 (silme hakkı) + md.7 (saklama süresi) ile uyumlu:
 *   - Talep + 30 gün = grace period (geri alma)
 *   - Anonymize sonrası 60 gün = denetim/audit erişimi (toplam 90 gün)
 *   - 90+ gün = tam silme
 */
import { and, eq, isNull, isNotNull, lt, sql } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { getDb, users } from '@damga/db';
import { logger } from '../config/logger';
import { env, isConfigured } from '../config/env';

const HARD_DELETE_AFTER_DAYS = 60; // anonymize'den 60 gün sonra row silinir

function getSupabaseAdmin() {
  if (!isConfigured.supabase) return null;
  return createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * 1. Anonymize: deletion_scheduled_at gelen kullanıcıları işle.
 *
 * Anonymize SADECE PII alanlarını temizler. Damga event'leri (attendance_events)
 * korunur — user_id ile bağlantı kalır, audit izi bütünlüğü için. Frontend listede
 * gösterirken full_name='[Silinmiş Kullanıcı]' görünür.
 */
export async function anonymizeReadyUsers(): Promise<{ count: number }> {
  const db = getDb();
  const now = new Date();

  const ready = await db
    .select({
      id: users.id,
      auth_user_id: users.auth_user_id,
      email: users.email,
      org_id: users.org_id,
    })
    .from(users)
    .where(
      and(
        isNotNull(users.deletion_scheduled_at),
        lt(users.deletion_scheduled_at, now),
        isNull(users.deleted_at),
      ),
    );

  if (ready.length === 0) return { count: 0 };

  const supabase = getSupabaseAdmin();

  let processed = 0;
  for (const u of ready) {
    try {
      // 1. Supabase auth'tan sil (artık login mümkün değil)
      if (supabase && u.auth_user_id) {
        const { error } = await supabase.auth.admin.deleteUser(u.auth_user_id);
        if (error && !error.message.includes('not found')) {
          logger.warn(
            { userId: u.id, authUserId: u.auth_user_id, err: error.message },
            'Supabase auth silme uyarısı',
          );
        }
      }

      // 2. DB row'unda PII temizle + deleted_at işaretle
      await db
        .update(users)
        .set({
          full_name: '[Silinmiş Kullanıcı]',
          email: `deleted-${u.id}@damga-anonymized.invalid`, // unique constraint için fake
          phone: null,
          username: null,
          avatar_url: null,
          title: null,
          department: null,
          device_ids: [],
          auth_user_id: null,
          deleted_at: now,
          is_active: false,
          updated_at: now,
        })
        .where(eq(users.id, u.id));

      logger.info(
        { userId: u.id, orgId: u.org_id, originalEmail: u.email },
        '✓ KVKK md.11: kullanıcı PII anonymize edildi',
      );
      processed++;
    } catch (e) {
      logger.error({ err: e, userId: u.id }, 'Anonymize başarısız (sonraki tur tekrar denenir)');
    }
  }
  return { count: processed };
}

/**
 * 2. Hard delete: anonymize'den 60 gün geçmiş kullanıcıları sil.
 * CASCADE ile attendance_events, leaves, notifications, vs. tümü silinir.
 */
export async function hardDeleteOldUsers(): Promise<{ count: number }> {
  const cutoff = new Date(Date.now() - HARD_DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const r = await getDb().execute(
    sql`
      DELETE FROM public.users
      WHERE deleted_at IS NOT NULL
        AND deleted_at < ${cutoff.toISOString()}
      RETURNING id
    `,
  );
  const rows = (r as unknown as { rows?: Array<{ id: string }> }).rows ?? (r as unknown as Array<{ id: string }>);
  const count = Array.isArray(rows) ? rows.length : 0;
  if (count > 0) {
    logger.info({ count, cutoff: cutoff.toISOString() }, '🗑️ Hard delete: eski anonymize\'lar silindi');
  }
  return { count };
}

let timer: NodeJS.Timeout | null = null;
let lastRunDate: string | null = null;

function tick(): void {
  // Sadece 04:00 (TR) civarında çalış — 60sn tick ile 04:00-04:01 arası bir kez
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  const ymd = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = get('hour');
  const minute = get('minute');
  if (hour === '04' && minute === '00' && lastRunDate !== ymd) {
    lastRunDate = ymd;
    void (async () => {
      try {
        const anon = await anonymizeReadyUsers();
        const hard = await hardDeleteOldUsers();
        logger.info({ anonymized: anon.count, hardDeleted: hard.count }, '✓ account-cleanup tamamlandı');
      } catch (e) {
        logger.error({ err: e }, 'account-cleanup hata');
      }
    })();
  }
}

export function startAccountCleanup(): void {
  if (timer) return;
  timer = setInterval(tick, 60_000);
  logger.info('🗑️ Account cleanup cron başlatıldı (her gün 04:00 TR, KVKK md.11)');
}

export function stopAccountCleanup(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
