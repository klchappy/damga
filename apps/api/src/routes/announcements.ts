import { Router } from 'express';
import { and, desc, eq, isNull, or, sql, gt } from 'drizzle-orm';
import { z } from 'zod';
import { createAnnouncementSchema } from '@damga/shared';
import { getDb, announcements, announcementReads, users } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';

export const announcementsRouter = Router();

const listQuery = z.object({
  unread_only: z.coerce.boolean().optional(),
});

announcementsRouter.get('/announcements', requireAuth, async (req, res, next) => {
  try {
    if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
    const q = listQuery.parse(req.query);
    const now = new Date();

    // Bu kullanıcıya yönelik veya tüm org'a açık olanlar
    const conditions = [
      eq(announcements.org_id, req.authOrgId),
      or(
        sql`${announcements.target_user_ids} = '{}'::uuid[]`,
        sql`${req.authUserId}::uuid = ANY(${announcements.target_user_ids})`,
      )!,
      or(isNull(announcements.expires_at), gt(announcements.expires_at, now))!,
    ];

    const rows = await getDb()
      .select({
        announcement: announcements,
        creatorName: users.full_name,
        readAt: announcementReads.read_at,
      })
      .from(announcements)
      .leftJoin(users, eq(users.id, announcements.created_by))
      .leftJoin(
        announcementReads,
        and(
          eq(announcementReads.announcement_id, announcements.id),
          eq(announcementReads.user_id, req.authUserId),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(announcements.pinned), desc(announcements.created_at));

    let items = rows.map((r) => ({
      ...r.announcement,
      creator_name: r.creatorName,
      read_at: r.readAt,
      is_read: !!r.readAt,
    }));
    if (q.unread_only) items = items.filter((a) => !a.is_read);

    res.json({ items });
  } catch (err) {
    next(err);
  }
});

announcementsRouter.post(
  '/announcements',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
      const input = createAnnouncementSchema.parse(req.body);
      const [a] = await getDb()
        .insert(announcements)
        .values({
          org_id: req.authOrgId,
          created_by: req.authUserId,
          category: input.category,
          title: input.title,
          body: input.body,
          target_user_ids: input.target_user_ids,
          pinned: input.pinned,
          expires_at: input.expires_at ? new Date(input.expires_at) : null,
        })
        .returning();
      res.status(201).json({ announcement: a });
    } catch (err) {
      next(err);
    }
  },
);

announcementsRouter.post('/announcements/:id/read', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUserId) throw new HttpError(401, 'Yetki yok');
    const id = String(req.params.id ?? '').trim();
    await getDb()
      .insert(announcementReads)
      .values({ announcement_id: id, user_id: req.authUserId })
      .onConflictDoNothing();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
