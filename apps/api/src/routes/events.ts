import { Router } from 'express';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { disputeEventSchema } from '@damga/shared';
import { getDb, attendanceEvents, users, locations } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole, requireScope } from '../middleware/auth';

export const eventsRouter = Router();

const listQuery = z.object({
  user_id: z.string().uuid().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  type: z
    .enum(['check_in', 'check_out', 'edit_request', 'manual_entry', 'admin_correction', 'dispute'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

eventsRouter.get('/events', requireAuth, requireScope('events:read'), async (req, res, next) => {
  try {
    if (!req.authOrgId) throw new HttpError(401, "Yetki yok");
    const q = listQuery.parse(req.query);

    const isManager = req.authUser
      ? ['manager', 'admin', 'owner'].includes(req.authUser.role)
      : !!req.apiKeyId;
    // Çalışan: sadece kendi event'leri
    const targetUserId = isManager ? q.user_id : req.authUserId;

    const conditions = [eq(attendanceEvents.org_id, req.authOrgId)];
    if (targetUserId) conditions.push(eq(attendanceEvents.user_id, targetUserId));
    if (q.type) conditions.push(eq(attendanceEvents.type, q.type));
    if (q.date_from) conditions.push(gte(attendanceEvents.server_time, new Date(q.date_from)));
    if (q.date_to) conditions.push(lte(attendanceEvents.server_time, new Date(q.date_to)));

    const where = and(...conditions);

    const rows = await getDb()
      .select({
        event: attendanceEvents,
        userName: users.full_name,
        userEmail: users.email,
        userAvatar: users.avatar_url,
        locationName: locations.name,
      })
      .from(attendanceEvents)
      .leftJoin(users, eq(users.id, attendanceEvents.user_id))
      .leftJoin(locations, eq(locations.id, attendanceEvents.location_id))
      .where(where)
      .orderBy(desc(attendanceEvents.server_time))
      .limit(q.limit)
      .offset(q.offset);

    const totalRows = await getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(attendanceEvents)
      .where(where);
    const count = totalRows[0]?.count ?? 0;

    res.json({
      items: rows.map((r) => ({
        ...r.event,
        user: r.userName ? { full_name: r.userName, email: r.userEmail, avatar_url: r.userAvatar } : null,
        location: r.locationName ? { name: r.locationName } : null,
      })),
      total: count,
      limit: q.limit,
      offset: q.offset,
    });
  } catch (err) {
    next(err);
  }
});

eventsRouter.get('/events/:id', requireAuth, requireScope('events:read'), async (req, res, next) => {
  try {
    if (!req.authOrgId) throw new HttpError(401, "Yetki yok");
    const id = String(req.params.id ?? '').trim();
    const [event] = await getDb()
      .select()
      .from(attendanceEvents)
      .where(and(eq(attendanceEvents.id, id), eq(attendanceEvents.org_id, req.authOrgId)));
    if (!event) throw new HttpError(404, 'Event bulunamadı');
    // Çalışansa sadece kendi event'i
    const isManager = req.authUser
      ? ['manager', 'admin', 'owner'].includes(req.authUser.role)
      : true;
    if (!isManager && event.user_id !== req.authUserId) {
      throw new HttpError(403, 'Bu event size ait değil');
    }
    res.json({ event });
  } catch (err) {
    next(err);
  }
});

/** Çalışan itirazı: yeni event olarak kaydet (type=dispute) */
eventsRouter.post('/events/:id/dispute', requireAuth, async (req, res, next) => {
  try {
    if (!req.authOrgId || !req.authUserId) throw new HttpError(401, "Yetki yok");
    const targetId = String(req.params.id ?? '').trim();
    const body = disputeEventSchema.parse(req.body);
    const db = getDb();
    const [target] = await db
      .select()
      .from(attendanceEvents)
      .where(and(eq(attendanceEvents.id, targetId), eq(attendanceEvents.org_id, req.authOrgId)));
    if (!target) throw new HttpError(404, 'Event bulunamadı');
    if (target.user_id !== req.authUserId) {
      throw new HttpError(403, 'Sadece kendi event\'inize itiraz edebilirsiniz');
    }
    const now = new Date();
    const [dispute] = await db
      .insert(attendanceEvents)
      .values({
        org_id: req.authOrgId,
        user_id: req.authUserId,
        type: 'dispute',
        client_time: now,
        server_time: now,
        effective_time: now,
        verification_score: 0,
        evidence_hash: 'dispute',
        this_event_hash: 'PENDING',
        supersedes_event_id: target.id,
        edit_reason: body.reason,
        edited_by_user_id: req.authUserId,
      })
      .returning();
    res.status(201).json({ event: dispute });
  } catch (err) {
    next(err);
  }
});

/** Hash chain doğrulama (audit) — sadece manager+ */
eventsRouter.get(
  '/events/verify-chain',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, "Yetki yok");
      const result = await getDb().execute<{
        event_id: string;
        is_valid: boolean;
        expected_hash: string;
        actual_hash: string;
        position: number;
      }>(sql`select * from verify_hash_chain(${req.authOrgId}::uuid)`);
      // node-postgres driver: result.rows içinde
      const rows = (result as unknown as { rows: Array<{ is_valid: boolean }> }).rows ?? [];
      const total = rows.length;
      const broken = rows.filter((r) => !r.is_valid);
      res.json({
        total,
        valid: total - broken.length,
        broken: broken.length,
        first_broken: broken[0] ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);
