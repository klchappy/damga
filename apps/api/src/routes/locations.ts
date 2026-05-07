import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import {
  createLocationSchema,
  updateLocationSchema,
  createNfcTagSchema,
  createQrCodeSchema,
} from '@damga/shared';
import { signNfcTag, signQrCode } from '@damga/verification';
import { randomBytes } from 'node:crypto';
import { getDb, locations } from '@damga/db';
import { env } from '../config/env';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';

export const locationsRouter = Router();

locationsRouter.get('/locations', requireAuth, async (req, res, next) => {
  try {
    if (!req.authOrgId) throw new HttpError(401, "Yetki yok");
    const rows = await getDb()
      .select()
      .from(locations)
      .where(eq(locations.org_id, req.authOrgId));
    res.json({ items: rows });
  } catch (err) {
    next(err);
  }
});

locationsRouter.post(
  '/locations',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, "Yetki yok");
      const input = createLocationSchema.parse(req.body);
      const [loc] = await getDb()
        .insert(locations)
        .values({ ...input, org_id: req.authOrgId })
        .returning();
      res.status(201).json({ location: loc });
    } catch (err) {
      next(err);
    }
  },
);

locationsRouter.patch(
  '/locations/:id',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, "Yetki yok");
      const id = String(req.params.id ?? '').trim();
      const input = updateLocationSchema.parse(req.body);
      const [loc] = await getDb()
        .update(locations)
        .set({ ...input, updated_at: new Date() })
        .where(and(eq(locations.id, id), eq(locations.org_id, req.authOrgId)))
        .returning();
      if (!loc) throw new HttpError(404, "Bulunamadı");
      res.json({ location: loc });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/locations/:id/nfc-tags — yeni NFC tag içeriği üret.
 * Cevapta `nfc_payload` döner — bu kullanıcı tag'a yazar (NFC writer ile)
 */
locationsRouter.post(
  '/locations/:id/nfc-tags',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, "Yetki yok");
      const locationId = String(req.params.id ?? '').trim();
      const body = createNfcTagSchema.parse({ ...req.body, location_id: locationId });

      const tagId = `nfc_${randomBytes(8).toString('hex')}`;
      const nonce = randomBytes(8).toString('hex');
      const payload = signNfcTag(env.NFC_SIGNING_SECRET, {
        tag_id: tagId,
        location_id: locationId,
        issued_at: Date.now(),
        nonce,
      });

      // Lokasyonun nfc_tag_ids whitelist'ine ekle
      const [loc] = await getDb()
        .select()
        .from(locations)
        .where(and(eq(locations.id, locationId), eq(locations.org_id, req.authOrgId)));
      if (!loc) throw new HttpError(404, 'Lokasyon bulunamadı');

      await getDb()
        .update(locations)
        .set({
          nfc_tag_ids: [...loc.nfc_tag_ids, tagId],
          updated_at: new Date(),
        })
        .where(eq(locations.id, locationId));

      res.status(201).json({
        tag_id: tagId,
        label: body.label,
        nfc_payload: payload,
        instructions:
          'Bu payload\'u NFC tag\'ına yaz (örn. NFC Tools uygulaması ile). Çalışan tap\'ladığında otomatik check-in olur.',
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/locations/:id/qr-codes — yeni QR kod payload'u üret (TTL ile).
 */
locationsRouter.post(
  '/locations/:id/qr-codes',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, "Yetki yok");
      const locationId = String(req.params.id ?? '').trim();
      const body = createQrCodeSchema.parse({ ...req.body, location_id: locationId });

      const payload = signQrCode(env.NFC_SIGNING_SECRET, {
        location_id: locationId,
        ttl_days: body.ttl_days,
      });

      const [loc] = await getDb()
        .select()
        .from(locations)
        .where(and(eq(locations.id, locationId), eq(locations.org_id, req.authOrgId)));
      if (!loc) throw new HttpError(404, "Bulunamadı");

      await getDb()
        .update(locations)
        .set({
          qr_codes: [...loc.qr_codes, payload],
          updated_at: new Date(),
        })
        .where(eq(locations.id, locationId));

      res.status(201).json({
        label: body.label,
        qr_payload: payload,
        ttl_days: body.ttl_days,
        instructions:
          'Bu payload\'u QR koda dönüştürüp duvara astır (örn. qr-code-generator.com). Çalışan kamerayla tarayınca check-in olur.',
      });
    } catch (err) {
      next(err);
    }
  },
);
