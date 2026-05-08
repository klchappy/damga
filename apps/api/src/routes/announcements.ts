import { Router } from 'express';
import { and, desc, eq, isNull, or, sql, gt } from 'drizzle-orm';
import { z } from 'zod';
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
  createAnnouncementCommentSchema,
} from '@damga/shared';
import {
  getDb,
  announcements,
  announcementReads,
  announcementComments,
  users,
} from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';
import { dispatchWebhook } from '../modules/webhook-delivery';

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
  requireRole('admin', 'owner'),
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
      void dispatchWebhook({
        orgId: req.authOrgId,
        eventType: 'announcement.published',
        payload: a,
      });
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

/**
 * PATCH /v1/announcements/:id — admin/owner duyuruyu düzenler
 */
announcementsRouter.patch(
  '/announcements/:id',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const input = updateAnnouncementSchema.parse(req.body);

      const updates: Record<string, unknown> = {};
      if (input.category !== undefined) updates.category = input.category;
      if (input.title !== undefined) updates.title = input.title;
      if (input.body !== undefined) updates.body = input.body;
      if (input.pinned !== undefined) updates.pinned = input.pinned;
      if (input.expires_at !== undefined) {
        updates.expires_at = input.expires_at ? new Date(input.expires_at) : null;
      }

      const [updated] = await getDb()
        .update(announcements)
        .set(updates)
        .where(and(eq(announcements.id, id), eq(announcements.org_id, req.authOrgId)))
        .returning();
      if (!updated) throw new HttpError(404, 'Duyuru bulunamadı');
      res.json({ announcement: updated });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /v1/announcements/:id — admin/owner duyuruyu siler.
 * announcement_reads ve announcement_comments cascade olarak silinir.
 */
announcementsRouter.delete(
  '/announcements/:id',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const [deleted] = await getDb()
        .delete(announcements)
        .where(and(eq(announcements.id, id), eq(announcements.org_id, req.authOrgId)))
        .returning({ id: announcements.id });
      if (!deleted) throw new HttpError(404, 'Duyuru bulunamadı');
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/announcements/:id/comments — kullanıcı yorum ekler
 *
 * Yetki: tüm authenticated kullanıcılar (rol fark etmez).
 */
announcementsRouter.post(
  '/announcements/:id/comments',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!req.authUserId || !req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const input = createAnnouncementCommentSchema.parse(req.body);

      // Duyurunun bu org'a ait olduğunu doğrula
      const [a] = await getDb()
        .select({ id: announcements.id })
        .from(announcements)
        .where(and(eq(announcements.id, id), eq(announcements.org_id, req.authOrgId)));
      if (!a) throw new HttpError(404, 'Duyuru bulunamadı');

      const [created] = await getDb()
        .insert(announcementComments)
        .values({
          announcement_id: id,
          org_id: req.authOrgId,
          user_id: req.authUserId,
          comment: input.comment,
        })
        .returning();
      res.status(201).json({ comment: created });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /v1/announcements/:id/comments — yorumları listele
 *
 * GÖRÜNÜRLÜK:
 *   - manager / admin / owner → TÜM yorumları görür (admin paneli için)
 *   - employee → sadece KENDİ yorumlarını görür
 *
 * Bu sayede çalışan başkasının yorumunu okuyamaz; admin/yönetici hepsini görür.
 */
announcementsRouter.get(
  '/announcements/:id/comments',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!req.authUserId || !req.authOrgId || !req.authUser) {
        throw new HttpError(401, 'Yetki yok');
      }
      const id = String(req.params.id ?? '').trim();
      const isManagerOrAbove = ['manager', 'admin', 'owner'].includes(req.authUser.role);

      const [a] = await getDb()
        .select({ id: announcements.id })
        .from(announcements)
        .where(and(eq(announcements.id, id), eq(announcements.org_id, req.authOrgId)));
      if (!a) throw new HttpError(404, 'Duyuru bulunamadı');

      const conditions = [
        eq(announcementComments.announcement_id, id),
        eq(announcementComments.org_id, req.authOrgId),
      ];
      if (!isManagerOrAbove) {
        conditions.push(eq(announcementComments.user_id, req.authUserId));
      }

      const rows = await getDb()
        .select({
          comment: announcementComments,
          user_name: users.full_name,
          department: users.department,
        })
        .from(announcementComments)
        .leftJoin(users, eq(users.id, announcementComments.user_id))
        .where(and(...conditions))
        .orderBy(desc(announcementComments.created_at));

      const items = rows.map((r) => ({
        id: r.comment.id,
        comment: r.comment.comment,
        created_at: r.comment.created_at,
        user_name: r.user_name,
        department: r.department,
        user_id: r.comment.user_id,
        is_self: r.comment.user_id === req.authUserId,
      }));

      res.json({
        items,
        scope: isManagerOrAbove ? 'all' : 'self',
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /v1/announcements/:id/comments/:commentId
 *  - Çalışan kendi yorumunu silebilir
 *  - admin/owner her yorumu silebilir
 */
announcementsRouter.delete(
  '/announcements/:id/comments/:commentId',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!req.authUserId || !req.authOrgId || !req.authUser) {
        throw new HttpError(401, 'Yetki yok');
      }
      const commentId = String(req.params.commentId ?? '').trim();
      const isAdmin = ['admin', 'owner'].includes(req.authUser.role);

      const [c] = await getDb()
        .select()
        .from(announcementComments)
        .where(
          and(
            eq(announcementComments.id, commentId),
            eq(announcementComments.org_id, req.authOrgId),
          ),
        );
      if (!c) throw new HttpError(404, 'Yorum bulunamadı');
      if (!isAdmin && c.user_id !== req.authUserId) {
        throw new HttpError(403, 'Sadece kendi yorumunu silebilirsin');
      }

      await getDb().delete(announcementComments).where(eq(announcementComments.id, commentId));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
