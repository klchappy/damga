import { Router } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { createDepartmentSchema, updateDepartmentSchema } from '@damga/shared';
import { departments, getDb, users } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';

export const departmentsRouter = Router();

function slugify(input: string): string {
  const trMap: Record<string, string> = {
    ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i',
    ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
  };
  return input
    .split('')
    .map((c) => trMap[c] ?? c)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/* GET /v1/departments — auth gerekli (sign-up sayfası bile listeler) */
departmentsRouter.get('/departments', requireAuth, async (req, res, next) => {
  try {
    if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
    const rows = await getDb()
      .select()
      .from(departments)
      .where(eq(departments.org_id, req.authOrgId))
      .orderBy(asc(departments.is_default), asc(departments.name));
    res.json({ items: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * Public sign-up sayfası için (auth henüz yok) — org slug ile listele.
 * Org slug bilinmiyorsa 404. Sign-up'ta org_slug query param zorunlu.
 */
departmentsRouter.get('/departments/public', async (req, res, next) => {
  try {
    const { orgs } = await import('@damga/db');
    const orgSlug = String(req.query.org ?? '').trim();
    if (!orgSlug) throw new HttpError(400, 'org query param gerekli');
    const [org] = await getDb().select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, orgSlug));
    if (!org) throw new HttpError(404, 'Şirket bulunamadı');
    const rows = await getDb()
      .select({ id: departments.id, name: departments.name, slug: departments.slug, color: departments.color })
      .from(departments)
      .where(eq(departments.org_id, org.id))
      .orderBy(asc(departments.is_default), asc(departments.name));
    res.json({ items: rows });
  } catch (err) {
    next(err);
  }
});

/* POST /v1/departments — admin/owner */
departmentsRouter.post(
  '/departments',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const input = createDepartmentSchema.parse(req.body);
      const slug = input.slug ?? slugify(input.name);
      if (!slug) throw new HttpError(400, 'Geçersiz isim/slug', 'INVALID_SLUG');

      const existing = await getDb()
        .select({ id: departments.id })
        .from(departments)
        .where(and(eq(departments.org_id, req.authOrgId), eq(departments.slug, slug)));
      if (existing.length > 0) {
        throw new HttpError(409, 'Bu slug zaten kullanımda', 'DEPT_SLUG_EXISTS');
      }

      const [dept] = await getDb()
        .insert(departments)
        .values({
          org_id: req.authOrgId,
          name: input.name,
          slug,
          color: input.color,
          is_default: false,
        })
        .returning();
      res.status(201).json({ department: dept });
    } catch (err) {
      next(err);
    }
  },
);

/* PATCH /v1/departments/:id */
departmentsRouter.patch(
  '/departments/:id',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();
      const input = updateDepartmentSchema.parse(req.body);
      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (input.name) updates.name = input.name;
      if (input.color) updates.color = input.color;
      if (input.slug) updates.slug = input.slug;
      const [dept] = await getDb()
        .update(departments)
        .set(updates)
        .where(and(eq(departments.id, id), eq(departments.org_id, req.authOrgId)))
        .returning();
      if (!dept) throw new HttpError(404, 'Departman bulunamadı');
      res.json({ department: dept });
    } catch (err) {
      next(err);
    }
  },
);

/* DELETE /v1/departments/:id */
departmentsRouter.delete(
  '/departments/:id',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const id = String(req.params.id ?? '').trim();

      const [dept] = await getDb()
        .select()
        .from(departments)
        .where(and(eq(departments.id, id), eq(departments.org_id, req.authOrgId)));
      if (!dept) throw new HttpError(404, 'Departman bulunamadı');
      if (dept.is_default && dept.slug === 'diger') {
        throw new HttpError(400, '"Diğer" silinemez (kullanılan departmanlar için fallback)');
      }

      // Bu departmanı kullanan çalışanları "Diğer"e taşı
      await getDb()
        .update(users)
        .set({ department: 'Diğer' })
        .where(and(eq(users.org_id, req.authOrgId), eq(users.department, dept.name)));

      await getDb()
        .delete(departments)
        .where(and(eq(departments.id, id), eq(departments.org_id, req.authOrgId)));

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
