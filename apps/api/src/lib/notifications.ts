/**
 * In-app notification helper.
 *
 * Olay olunca: createNotification(...) — kullanıcının `notifications` tablosuna
 * satır eklenir. Web app `/v1/me/notifications` endpoint'ini polling yaparak
 * çeker ve unread varsa (browser permission varsa) ekran bildirimi gösterir.
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb, notifications } from '@damga/db';
import { logger } from '../config/logger';

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
    return r ? { id: r.id } : null;
  } catch (e) {
    logger.error({ err: e, type: input.type }, 'createNotification failed');
    return null;
  }
}

export async function listMyNotifications(
  userId: string,
  opts?: { limit?: number; unreadOnly?: boolean },
) {
  const db = getDb();
  const conds = [eq(notifications.user_id, userId)];
  if (opts?.unreadOnly) conds.push(eq(notifications.is_read, false));
  return db
    .select()
    .from(notifications)
    .where(and(...conds))
    .orderBy(desc(notifications.created_at))
    .limit(opts?.limit ?? 30);
}

export async function countUnread(userId: string): Promise<number> {
  const [r] = await getDb()
    .select({ c: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.user_id, userId), eq(notifications.is_read, false)));
  return r?.c ?? 0;
}

export async function markRead(userId: string, id: string) {
  await getDb()
    .update(notifications)
    .set({ is_read: true, read_at: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.user_id, userId)));
}

export async function markAllRead(userId: string) {
  await getDb()
    .update(notifications)
    .set({ is_read: true, read_at: new Date() })
    .where(and(eq(notifications.user_id, userId), eq(notifications.is_read, false)));
}
