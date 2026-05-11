/**
 * Idempotency-Key middleware.
 *
 * POST/PUT/PATCH/DELETE retry'larin guvenli tekrar islemesi:
 * - Client `Idempotency-Key: <unique_string>` header gonderir (UUID/ULID onerilir).
 * - Ayni key + method + path ile gelen yeni istek:
 *   - request_hash uyusursa: cached response doner (orijinal status + body)
 *   - request_hash uyusmazsa: 422 (key reused with different body)
 * - TTL: 24 saat (eski kayitlar atlanir + cleanup ileride scheduler ile)
 *
 * GET istekleri zaten idempotent (HTTP semantik), middleware bypass eder.
 *
 * IMPORTANT: requireAuth'tan sonra mount edilmeli (org_id/api_key_id resolve icin).
 * Apply pattern: state-changing route'larda inline (router.post('/x', requireAuth, idempotency, ...)).
 */
import type { RequestHandler, Response } from 'express';
import { createHash } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { getDb, idempotencyKeys } from '@damga/db';
import { HttpError } from './error';
import { logger } from '../config/logger';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TTL_MS = 24 * 60 * 60 * 1000;

function hashBody(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');
}

export const idempotencyMiddleware: RequestHandler = async (req, res, next) => {
  const rawKey = req.header('idempotency-key');
  if (!rawKey) return next();
  if (!STATE_CHANGING.has(req.method)) return next();

  const key = rawKey.trim();
  if (key.length < 8 || key.length > 200) {
    return next(new HttpError(400, 'Idempotency-Key 8-200 karakter olmali', 'BAD_IDEMPOTENCY_KEY'));
  }

  const reqHash = hashBody(req.body);
  const db = getDb();

  try {
    const [existing] = await db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.key, key),
          eq(idempotencyKeys.method, req.method),
          eq(idempotencyKeys.path, req.path),
        ),
      );

    if (existing) {
      const ageMs = Date.now() - new Date(existing.created_at).getTime();
      if (ageMs > TTL_MS) {
        // Stale, sil ve yeni kayit acilacak
        await db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, existing.id));
      } else {
        if (existing.request_hash !== reqHash) {
          throw new HttpError(
            422,
            'Idempotency key ayni endpoint icin farkli body ile yeniden kullanildi',
            'IDEMPOTENCY_KEY_REUSED',
          );
        }
        if (existing.response_status != null && existing.response_body !== null) {
          // Cached response — orijinal sonucu dön
          res.setHeader('Idempotent-Replay', 'true');
          res.setHeader('Idempotent-Original-Created', existing.created_at.toISOString());
          return res.status(existing.response_status).json(existing.response_body);
        }
        // İşleniyor olabilir (race) — basit MVP'de geçer
      }
    }

    // Yeni kayit (response henuz yok)
    await db
      .insert(idempotencyKeys)
      .values({
        key,
        method: req.method,
        path: req.path,
        request_hash: reqHash,
        org_id: req.authOrgId ?? null,
        api_key_id: req.apiKeyId ?? null,
      })
      .onConflictDoNothing();

    // Response intercept — orjinal res.json'u sar
    // Sadece 2xx (success) ve 4xx (client error, deterministic) cache'le.
    // 5xx (server error) cache'lenmez — gecici olabilir, retry mantikli olur.
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      const status = res.statusCode;
      if (status >= 200 && status < 500) {
        void db
          .update(idempotencyKeys)
          .set({ response_status: status, response_body: body as object })
          .where(
            and(
              eq(idempotencyKeys.key, key),
              eq(idempotencyKeys.method, req.method),
              eq(idempotencyKeys.path, req.path),
            ),
          )
          .catch((err) => logger.warn({ err }, 'idempotency cache write failed'));
      } else {
        // 5xx: kayit acilmisti, sil — retry temiz olsun
        void db
          .delete(idempotencyKeys)
          .where(
            and(
              eq(idempotencyKeys.key, key),
              eq(idempotencyKeys.method, req.method),
              eq(idempotencyKeys.path, req.path),
            ),
          )
          .catch(() => {});
      }
      return originalJson(body);
    };

    next();
  } catch (err) {
    next(err);
  }
};
