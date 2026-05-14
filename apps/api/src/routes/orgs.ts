import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, orgs } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';
import { logger } from '../config/logger';

export const orgsRouter = Router();

const employeePageKeyEnum = z.enum([
  'home',
  'history',
  'leaves',
  'menu',
  'announcements',
  'profile',
  'mood',
  'status',
]);

/**
 * PATCH /v1/orgs/me/settings
 *
 * Admin/owner şirketin settings JSONB'sini düzenler. Şu an UI'dan
 * employee_visible_pages toggle ediliyor; ileride logo, primary_color vb.
 * de buraya eklenir.
 */
const updateSettingsSchema = z.object({
  employee_visible_pages: z.array(employeePageKeyEnum).min(1).max(8).optional(),
  allow_self_edit_request: z.boolean().optional(),
  allow_outside_geofence: z.boolean().optional(),
  require_nfc: z.boolean().optional(),
  allow_manual_entry: z.boolean().optional(),
  auto_selfie_every_stamp: z.boolean().optional(),
  logo_url: z.string().url().optional(),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  default_timezone: z.string().min(2).max(40).optional(),
});

orgsRouter.patch(
  '/orgs/me/settings',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const patch = updateSettingsSchema.parse(req.body);

      const db = getDb();
      const [current] = await db
        .select({ settings: orgs.settings })
        .from(orgs)
        .where(eq(orgs.id, req.authOrgId));
      if (!current) throw new HttpError(404, 'Şirket bulunamadı');

      const next = { ...(current.settings ?? {}), ...patch };
      const [updated] = await db
        .update(orgs)
        .set({ settings: next, updated_at: new Date() })
        .where(eq(orgs.id, req.authOrgId))
        .returning({ id: orgs.id, name: orgs.name, slug: orgs.slug, settings: orgs.settings });

      logger.info(
        { orgId: req.authOrgId, by: req.authUserId, keys: Object.keys(patch) },
        'Org settings güncellendi',
      );

      res.json({ org: updated });
    } catch (err) {
      next(err);
    }
  },
);

/** GET /v1/orgs/me — kendi org'umun bilgileri (settings dahil) */
orgsRouter.get('/orgs/me', requireAuth, async (req, res, next) => {
  try {
    if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
    const [row] = await getDb()
      .select({
        id: orgs.id,
        name: orgs.name,
        slug: orgs.slug,
        plan: orgs.plan,
        settings: orgs.settings,
        kvkk_consent_text: orgs.kvkk_consent_text,
      })
      .from(orgs)
      .where(eq(orgs.id, req.authOrgId));
    if (!row) throw new HttpError(404, 'Şirket bulunamadı');
    res.json({ org: row });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/orgs/me/onboarding/complete
 *
 * Owner onboarding wizard'ı tamamladığında çağrılır. settings.onboarding_completed_at
 * alanına ISO timestamp yazılır. Frontend bunu kontrol edip wizard'ı bir daha göstermez.
 */
orgsRouter.post(
  '/orgs/me/onboarding/complete',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const db = getDb();
      const [current] = await db
        .select({ settings: orgs.settings })
        .from(orgs)
        .where(eq(orgs.id, req.authOrgId));
      if (!current) throw new HttpError(404, 'Şirket bulunamadı');
      const next = {
        ...(current.settings ?? {}),
        onboarding_completed_at: new Date().toISOString(),
      };
      await db
        .update(orgs)
        .set({ settings: next, updated_at: new Date() })
        .where(eq(orgs.id, req.authOrgId));
      logger.info({ orgId: req.authOrgId, by: req.authUserId }, '✓ Onboarding tamamlandı');
      res.json({ ok: true, completed_at: next.onboarding_completed_at });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/orgs/me/onboarding/skip
 *
 * Owner "şimdi atla" derse settings.onboarding_skipped_at yazılır. Tamamlanmış
 * sayılmaz ama wizard tekrar gösterilmez.
 */
orgsRouter.post(
  '/orgs/me/onboarding/skip',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const db = getDb();
      const [current] = await db
        .select({ settings: orgs.settings })
        .from(orgs)
        .where(eq(orgs.id, req.authOrgId));
      if (!current) throw new HttpError(404, 'Şirket bulunamadı');
      const next = {
        ...(current.settings ?? {}),
        onboarding_skipped_at: new Date().toISOString(),
      };
      await db
        .update(orgs)
        .set({ settings: next, updated_at: new Date() })
        .where(eq(orgs.id, req.authOrgId));
      logger.info({ orgId: req.authOrgId, by: req.authUserId }, 'Onboarding atlandı');
      res.json({ ok: true, skipped_at: next.onboarding_skipped_at });
    } catch (err) {
      next(err);
    }
  },
);
