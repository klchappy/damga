import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import {
  createLocationSchema,
  updateLocationSchema,
  createNfcTagSchema,
  createQrCodeSchema,
} from '@damga/shared';
import { signNfcTag, signQrCode, signQrCodeUrl } from '@damga/verification';
import { randomBytes } from 'node:crypto';
import { getDb, locations, locationNfcTags, locationQrCodes } from '@damga/db';
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
 * GET /v1/locations/:id/nfc-tags — bu lokasyonun TÜM NFC tag'lerini listele.
 * Admin geçmişte oluşturulan tag'leri tekrar görüntüleyip indirebilir.
 */
locationsRouter.get(
  '/locations/:id/nfc-tags',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const locationId = String(req.params.id ?? '').trim();
      const db = getDb();
      const [loc] = await db
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.id, locationId), eq(locations.org_id, req.authOrgId)));
      if (!loc) throw new HttpError(404, 'Lokasyon bulunamadı');

      const items = await db
        .select()
        .from(locationNfcTags)
        .where(eq(locationNfcTags.location_id, locationId))
        .orderBy(desc(locationNfcTags.created_at));
      res.json({ items });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/locations/:id/nfc-tags — yeni NFC tag içeriği üret + DB'ye kaydet.
 * Sonra `GET /nfc-tags` ile tekrar görüntülenebilir/indirilebilir.
 */
locationsRouter.post(
  '/locations/:id/nfc-tags',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
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

      const db = getDb();
      const [loc] = await db
        .select()
        .from(locations)
        .where(and(eq(locations.id, locationId), eq(locations.org_id, req.authOrgId)));
      if (!loc) throw new HttpError(404, 'Lokasyon bulunamadı');

      // Detaylı tag kaydı
      const [created] = await db
        .insert(locationNfcTags)
        .values({
          location_id: locationId,
          org_id: req.authOrgId,
          tag_id: tagId,
          label: body.label,
          payload,
          created_by: req.authUserId,
        })
        .returning();

      // Eski whitelist (geriye uyumluluk için stamp endpoint hâlâ buraya bakıyor)
      await db
        .update(locations)
        .set({
          nfc_tag_ids: [...loc.nfc_tag_ids, tagId],
          updated_at: new Date(),
        })
        .where(eq(locations.id, locationId));

      res.status(201).json({
        nfc_tag: created,
        // Backward compat — eski client kodu bu alanlara bakıyor:
        tag_id: tagId,
        label: body.label,
        nfc_payload: payload,
        instructions:
          "Bu payload'u NFC tag'ına yaz (örn. NFC Tools uygulaması ile). Çalışan tap'ladığında otomatik check-in olur.",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /v1/locations/:id/nfc-tags/:tagId — NFC tag'i pasifleştir.
 * Soft delete: is_active=false, ayrıca whitelist'ten çıkar (artık checkin kabul olmasın).
 */
locationsRouter.delete(
  '/locations/:id/nfc-tags/:tagId',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const locationId = String(req.params.id ?? '').trim();
      const rowId = String(req.params.tagId ?? '').trim();
      const db = getDb();

      const [tag] = await db
        .select()
        .from(locationNfcTags)
        .where(and(eq(locationNfcTags.id, rowId), eq(locationNfcTags.org_id, req.authOrgId)));
      if (!tag) throw new HttpError(404, 'NFC tag bulunamadı');

      await db
        .update(locationNfcTags)
        .set({ is_active: false })
        .where(eq(locationNfcTags.id, rowId));

      // Whitelist'ten kaldır
      const [loc] = await db
        .select({ nfc_tag_ids: locations.nfc_tag_ids })
        .from(locations)
        .where(eq(locations.id, locationId));
      if (loc) {
        await db
          .update(locations)
          .set({
            nfc_tag_ids: loc.nfc_tag_ids.filter((t) => t !== tag.tag_id),
            updated_at: new Date(),
          })
          .where(eq(locations.id, locationId));
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /v1/locations/:id/qr-codes — bu lokasyonun TÜM QR kodlarını listele.
 */
locationsRouter.get(
  '/locations/:id/qr-codes',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const locationId = String(req.params.id ?? '').trim();
      const db = getDb();
      const [loc] = await db
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.id, locationId), eq(locations.org_id, req.authOrgId)));
      if (!loc) throw new HttpError(404, 'Lokasyon bulunamadı');

      const items = await db
        .select()
        .from(locationQrCodes)
        .where(eq(locationQrCodes.location_id, locationId))
        .orderBy(desc(locationQrCodes.created_at));
      res.json({ items });
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
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
      const locationId = String(req.params.id ?? '').trim();
      const body = createQrCodeSchema.parse({ ...req.body, location_id: locationId });

      // YENİ v2 URL formatı — telefon kamerası okuyunca tarayıcı /q sayfasını açar.
      // Server-side GPS+Geofence ZORUNLU doğrulama yapar → fotoğraflanan QR
      // proxy attack olarak işe yaramaz (evden okutulursa GPS reject eder).
      const baseUrl = env.CLIENT_URL ?? 'https://damga.deploi.net';
      const payload = signQrCodeUrl(env.NFC_SIGNING_SECRET, {
        location_id: locationId,
        ttl_days: body.ttl_days,
        baseUrl,
      });
      const expiresAt = new Date(Date.now() + body.ttl_days * 24 * 60 * 60 * 1000);

      const db = getDb();
      const [loc] = await db
        .select()
        .from(locations)
        .where(and(eq(locations.id, locationId), eq(locations.org_id, req.authOrgId)));
      if (!loc) throw new HttpError(404, 'Lokasyon bulunamadı');

      const [created] = await db
        .insert(locationQrCodes)
        .values({
          location_id: locationId,
          org_id: req.authOrgId,
          label: body.label,
          payload,
          ttl_days: body.ttl_days,
          expires_at: expiresAt,
          created_by: req.authUserId,
        })
        .returning();

      // Backward compat — eski whitelist'i de güncelle
      await db
        .update(locations)
        .set({
          qr_codes: [...loc.qr_codes, payload],
          updated_at: new Date(),
        })
        .where(eq(locations.id, locationId));

      res.status(201).json({
        qr_code: created,
        // Backward compat:
        label: body.label,
        qr_payload: payload,
        ttl_days: body.ttl_days,
        instructions:
          "Bu payload'u QR koda dönüştürüp duvara astır. Çalışan kamerayla tarayınca check-in olur.",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /v1/locations/:id/qr-codes/:qrId — QR kodunu pasifleştir.
 */
locationsRouter.delete(
  '/locations/:id/qr-codes/:qrId',
  requireAuth,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const locationId = String(req.params.id ?? '').trim();
      const rowId = String(req.params.qrId ?? '').trim();
      const db = getDb();

      const [qr] = await db
        .select()
        .from(locationQrCodes)
        .where(and(eq(locationQrCodes.id, rowId), eq(locationQrCodes.org_id, req.authOrgId)));
      if (!qr) throw new HttpError(404, 'QR kod bulunamadı');

      await db
        .update(locationQrCodes)
        .set({ is_active: false })
        .where(eq(locationQrCodes.id, rowId));

      const [loc] = await db
        .select({ qr_codes: locations.qr_codes })
        .from(locations)
        .where(eq(locations.id, locationId));
      if (loc) {
        await db
          .update(locations)
          .set({
            qr_codes: loc.qr_codes.filter((p) => p !== qr.payload),
            updated_at: new Date(),
          })
          .where(eq(locations.id, locationId));
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
