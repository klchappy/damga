/**
 * In-app notification helper.
 *
 * Olay olunca: createNotification(...) — kullanıcının `notifications` tablosuna
 * satır eklenir. Web app `/v1/me/notifications` endpoint'ini polling yaparak
 * çeker ve unread varsa (browser permission varsa) ekran bildirimi gösterir.
 */

import { eq, and, desc, sql, inArray, ne } from 'drizzle-orm';
import { getDb, notifications, users } from '@damga/db';
import { logger } from '../config/logger';
import { sendPushToUser } from './push';

export interface CreateNotificationInput {
  orgId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  url?: string | null;
  metadata?: Record<string, unknown>;
}

export async function createNotification(
  input: CreateNotificationInput,
): Promise<{ id: string } | null> {
  try {
    const [r] = await getDb()
      .insert(notifications)
      .values({
        org_id: input.orgId,
        user_id: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        url: input.url ?? null,
        metadata: input.metadata ?? {},
      })
      .returning({ id: notifications.id });

    // Web push (best-effort, fail-safe)
    void sendPushToUser(input.userId, {
      title: input.title,
      body: input.body ?? undefined,
      url: input.url ?? undefined,
      tag: `damga-${input.type}-${r?.id ?? 'x'}`,
    }).catch((e) => logger.warn({ err: e }, 'sendPushToUser failed (non-fatal)'));

    return r ? { id: r.id } : null;
  } catch (e) {
    logger.error({ err: e, type: input.type }, 'createNotification failed');
    return null;
  }
}

/**
 * SECURITY: Tüm notification helper'ları artık (user_id, org_id) ile filtre yapıyor.
 * Defense-in-depth — auth middleware'i bypass eden bir bug olursa veya helper başka
 * yerden çağrılırsa, org_id zorunlu parametre olarak gelir; cross-org veri sızıntısı
 * imkansız.
 */
export async function listMyNotifications(
  userId: string,
  orgId: string,
  opts?: { limit?: number; unreadOnly?: boolean },
) {
  const db = getDb();
  const conds = [
    eq(notifications.user_id, userId),
    eq(notifications.org_id, orgId),
  ];
  if (opts?.unreadOnly) conds.push(eq(notifications.is_read, false));
  return db
    .select()
    .from(notifications)
    .where(and(...conds))
    .orderBy(desc(notifications.created_at))
    .limit(opts?.limit ?? 30);
}

export async function countUnread(userId: string, orgId: string): Promise<number> {
  const [r] = await getDb()
    .select({ c: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.user_id, userId),
        eq(notifications.org_id, orgId),
        eq(notifications.is_read, false),
      ),
    );
  return r?.c ?? 0;
}

export async function markRead(userId: string, orgId: string, id: string) {
  await getDb()
    .update(notifications)
    .set({ is_read: true, read_at: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.user_id, userId),
        eq(notifications.org_id, orgId),
      ),
    );
}

export async function markAllRead(userId: string, orgId: string) {
  await getDb()
    .update(notifications)
    .set({ is_read: true, read_at: new Date() })
    .where(
      and(
        eq(notifications.user_id, userId),
        eq(notifications.org_id, orgId),
        eq(notifications.is_read, false),
      ),
    );
}

/**
 * Bir org'un tüm yöneticilerine (admin + owner + manager) toplu bildirim gönderir.
 * Damga olayı gibi yönetici dikkat etmesi gereken event'ler için.
 *
 * @param excludeUserId — damgalayan kişinin kendisi de admin/owner ise bildirim almasın
 */
export async function notifyOrgManagers(input: {
  orgId: string;
  type: string;
  title: string;
  body?: string | null;
  url?: string | null;
  metadata?: Record<string, unknown>;
  excludeUserId?: string;
  /** Sadece bu rollerdeki kullanıcılara gönder (default: tüm yöneticiler) */
  roles?: Array<'owner' | 'admin' | 'manager'>;
}): Promise<{ count: number }> {
  try {
    const db = getDb();
    const targetRoles = input.roles ?? ['owner', 'admin', 'manager'];
    const managers = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.org_id, input.orgId),
          eq(users.is_active, true),
          inArray(users.role, targetRoles),
          input.excludeUserId ? ne(users.id, input.excludeUserId) : sql`true`,
        ),
      );
    if (managers.length === 0) return { count: 0 };

    // Bulk insert — tek query
    const rows = await db
      .insert(notifications)
      .values(
        managers.map((m) => ({
          org_id: input.orgId,
          user_id: m.id,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          url: input.url ?? null,
          metadata: input.metadata ?? {},
        })),
      )
      .returning({ id: notifications.id, user_id: notifications.user_id });

    // Web push paralel (fire-and-forget, başarısızlık görmezden gelinir)
    for (const r of rows) {
      void sendPushToUser(r.user_id, {
        title: input.title,
        body: input.body ?? undefined,
        url: input.url ?? undefined,
        tag: `damga-${input.type}-${r.id}`,
      }).catch(() => {});
    }
    return { count: rows.length };
  } catch (e) {
    logger.error({ err: e, type: input.type }, 'notifyOrgManagers failed');
    return { count: 0 };
  }
}
