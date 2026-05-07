import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** SHA-256 hex digest */
export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/** HMAC-SHA256 hex */
export function hmacSha256(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time HMAC verify (timing attack korumalı) */
export function verifyHmac(secret: string, payload: string, providedHex: string): boolean {
  const expected = hmacSha256(secret, payload);
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(providedHex, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Bir check-in payload'ından evidence_hash hesaplar.
 * Aynı input → aynı hash. Tüm önemli alanlar dahil.
 */
export function computeEvidenceHash(input: {
  user_id: string;
  type: string;
  client_time: string;
  latitude?: number | null;
  longitude?: number | null;
  nfc_tag_id?: string | null;
  qr_code_payload?: string | null;
  wifi_bssid?: string | null;
  device_id?: string | null;
}): string {
  const canonical = JSON.stringify({
    user_id: input.user_id,
    type: input.type,
    client_time: input.client_time,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    nfc_tag_id: input.nfc_tag_id ?? null,
    qr_code_payload: input.qr_code_payload ?? null,
    wifi_bssid: input.wifi_bssid ?? null,
    device_id: input.device_id ?? null,
  });
  return sha256(canonical);
}

/** Public API key formatı: `dmg_live_<48 hex char>` */
export function generateApiKey(): { raw: string; prefix: string } {
  const raw = `dmg_live_${randomBytes(24).toString('hex')}`;
  const prefix = `${raw.slice(0, 16)}...`;
  return { raw, prefix };
}

/** Webhook secret üret: `whsec_<32 hex>` */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(16).toString('hex')}`;
}
