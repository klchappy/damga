/**
 * Kullanıcıya özel damga kimlikleri (QR/NFC) yönetimi.
 *
 * Endpoint'ler:
 *   GET    /v1/me/stamp-credentials              — Kendi credential'larım
 *   POST   /v1/me/stamp-credentials/generate     — Yeni QR üret (eskilerini revoke et)
 *   POST   /v1/me/stamp-credentials/:id/revoke   — Tek credential revoke
 *   GET    /v1/me/stamp-credentials/qr-image     — Aktif QR badge SVG (yazdırılabilir)
 *
 *   Admin/manager:
 *   POST   /v1/admin/users/:userId/stamp-credentials/generate  — Çalışan adına üret
 */
import { Router } from 'express';
import { and, desc, eq, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getDb, users, userStampCredentials } from '@damga/db';
import { HttpError } from '../middleware/error';
import { requireAuth, requireRole } from '../middleware/auth';
import { logger } from '../config/logger';

export const stampCredentialsRouter = Router();

/**
 * Crockford Base32 — okunması ve telaffuzu kolay (0/O, 1/I/L karışmaz).
 * 24 karakter ~120 bit entropi — brute force pratik olarak imkânsız.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function generateCredential(length = 24): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

const PREFIX_LEN = 8; // Lookup için ilk 8 char (uniqueness yetiyor)

/** GET /v1/me/stamp-credentials — kullanıcının kendi credential'ları */
stampCredentialsRouter.get('/me/stamp-credentials', requireAuth, async (req, res, next) => {
  try {
    if (!req.authUserId) throw new HttpError(401, 'Yetki yok');
    const rows = await getDb()
      .select({
        id: userStampCredentials.id,
        credential_type: userStampCredentials.credential_type,
        credential_prefix: userStampCredentials.credential_prefix,
        label: userStampCredentials.label,
        is_active: userStampCredentials.is_active,
        last_used_at: userStampCredentials.last_used_at,
        revoked_at: userStampCredentials.revoked_at,
        created_at: userStampCredentials.created_at,
      })
      .from(userStampCredentials)
      .where(eq(userStampCredentials.user_id, req.authUserId))
      .orderBy(desc(userStampCredentials.created_at));
    // Tam değeri DÖNDÜRMEYİZ — bir kez gösterildi, db'de sadece hash var
    res.json({ items: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/me/stamp-credentials/generate
 *
 * Body: { label?: string, revoke_existing?: boolean (default true) }
 * Response: { credential_value: "QR_TEXT_OLUR_BU", credential_prefix: "ABCD1234" }
 *
 * Üretildikten SONRA bir daha gösterilmez (sadece hash saklanır).
 * Frontend bunu alır → SVG QR'a çevirir → bastırması için kullanıcıya gösterir.
 */
stampCredentialsRouter.post(
  '/me/stamp-credentials/generate',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!req.authUserId || !req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const revokeExisting = req.body?.revoke_existing !== false; // default true
      const label = typeof req.body?.label === 'string' ? req.body.label.slice(0, 80) : null;

      const db = getDb();

      // Eski aktiflere revoke işle (genelde tek aktif olur — opsiyonel "yedek kart" durumu)
      if (revokeExisting) {
        await db
          .update(userStampCredentials)
          .set({ is_active: false, revoked_at: new Date() })
          .where(
            and(
              eq(userStampCredentials.user_id, req.authUserId),
              eq(userStampCredentials.is_active, true),
            ),
          );
      }

      // Üret + hash
      let credentialValue = '';
      let prefix = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        credentialValue = generateCredential(24);
        prefix = credentialValue.slice(0, PREFIX_LEN);
        const [existing] = await db
          .select({ id: userStampCredentials.id })
          .from(userStampCredentials)
          .where(eq(userStampCredentials.credential_prefix, prefix));
        if (!existing) break;
        if (attempt === 4) {
          throw new HttpError(500, 'Credential üretim çakışması — tekrar deneyin');
        }
      }
      const hash = await bcrypt.hash(credentialValue, 10);

      await db.insert(userStampCredentials).values({
        org_id: req.authOrgId,
        user_id: req.authUserId,
        credential_type: 'qr',
        credential_prefix: prefix,
        credential_value_hash: hash,
        label,
      });

      logger.info(
        { userId: req.authUserId, prefix, revokeExisting },
        '✓ Kişisel damga QR üretildi',
      );

      // ÖNEMLİ: credential_value SADECE BU response'ta görünür, db'de tutulmaz
      res.json({
        credential_value: credentialValue,
        credential_prefix: prefix,
        label,
        message:
          'Bu QR değeri ŞİMDİ kaydet/yazdır. Bir daha gösterilmeyecek. Kaybolursa yenisini üretirsin.',
      });
    } catch (err) {
      next(err);
    }
  },
);

/** POST /v1/me/stamp-credentials/:id/revoke */
stampCredentialsRouter.post(
  '/me/stamp-credentials/:id/revoke',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!req.authUserId) throw new HttpError(401, 'Yetki yok');
      const id = req.params.id as string | undefined;
      if (!id || typeof id !== 'string') throw new HttpError(400, 'id gerekli');
      const [row] = await getDb()
        .update(userStampCredentials)
        .set({ is_active: false, revoked_at: new Date() })
        .where(
          and(eq(userStampCredentials.id, id), eq(userStampCredentials.user_id, req.authUserId)),
        )
        .returning({ id: userStampCredentials.id });
      if (!row) throw new HttpError(404, 'Credential bulunamadı');
      logger.info({ userId: req.authUserId, credId: id }, 'Damga credential revoke edildi');
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Admin: bir başka kullanıcı için credential üret.
 * (Kullanıcı kendi telefonundan giremezken yöneticisi onun adına yapabilir.)
 */
stampCredentialsRouter.post(
  '/admin/users/:userId/stamp-credentials/generate',
  requireAuth,
  requireRole('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      const targetUserId = req.params.userId as string | undefined;
      if (!targetUserId || typeof targetUserId !== 'string') throw new HttpError(400, 'userId gerekli');
      // Hedef kullanıcının aynı org'da olduğunu doğrula
      const [target] = await getDb()
        .select({ id: users.id, full_name: users.full_name })
        .from(users)
        .where(and(eq(users.id, targetUserId), eq(users.org_id, req.authOrgId)));
      if (!target) throw new HttpError(404, 'Çalışan bulunamadı');

      const db = getDb();
      await db
        .update(userStampCredentials)
        .set({ is_active: false, revoked_at: new Date() })
        .where(
          and(
            eq(userStampCredentials.user_id, targetUserId),
            eq(userStampCredentials.is_active, true),
          ),
        );

      let credentialValue = '';
      let prefix = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        credentialValue = generateCredential(24);
        prefix = credentialValue.slice(0, PREFIX_LEN);
        const [existing] = await db
          .select({ id: userStampCredentials.id })
          .from(userStampCredentials)
          .where(eq(userStampCredentials.credential_prefix, prefix));
        if (!existing) break;
      }
      const hash = await bcrypt.hash(credentialValue, 10);
      await db.insert(userStampCredentials).values({
        org_id: req.authOrgId,
        user_id: targetUserId,
        credential_type: 'qr',
        credential_prefix: prefix,
        credential_value_hash: hash,
        label: `${target.full_name} — yönetici tarafından üretildi`,
      });

      logger.info(
        { byUserId: req.authUserId, forUserId: targetUserId, prefix },
        'Admin çalışan adına QR üretti',
      );

      res.json({
        credential_value: credentialValue,
        credential_prefix: prefix,
        for_user: { id: target.id, full_name: target.full_name },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Verilen credential_value'yu bcrypt ile match et — kullanıcıyı bul.
 * Diğer route'lar (kiosk-stamp) bunu kullanır.
 */
export async function findUserByCredential(
  orgId: string,
  credentialValue: string,
): Promise<{ user_id: string; credential_id: string } | null> {
  if (!credentialValue || credentialValue.length < PREFIX_LEN) return null;
  const prefix = credentialValue.slice(0, PREFIX_LEN);
  const candidates = await getDb()
    .select()
    .from(userStampCredentials)
    .where(
      and(
        eq(userStampCredentials.credential_prefix, prefix),
        eq(userStampCredentials.org_id, orgId),
        eq(userStampCredentials.is_active, true),
        isNull(userStampCredentials.revoked_at),
      ),
    );
  for (const c of candidates) {
    if (await bcrypt.compare(credentialValue, c.credential_value_hash)) {
      // Last used güncelle (fire-and-forget)
      void getDb()
        .update(userStampCredentials)
        .set({ last_used_at: new Date() })
        .where(eq(userStampCredentials.id, c.id))
        .catch(() => {});
      return { user_id: c.user_id, credential_id: c.id };
    }
  }
  return null;
}
