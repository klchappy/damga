import { hmacSha256, verifyHmac } from './hash';

/**
 * QR kod payload formatı:
 *   v1|location_id|issued_at|expires_at|nonce|hmac
 *
 * Daha basit alternatif olarak base64 encode edilmiş JSON da kullanılabilir;
 * pipe-separated tutmak QR boyutunu küçültür (telefonun okumasını kolaylaştırır).
 */

export interface QrPayload {
  version: string;
  location_id: string;
  issued_at: number;
  expires_at: number;
  nonce: string;
}

export function signQrCode(
  secret: string,
  args: { location_id: string; ttl_days: number; nonce?: string },
): string {
  const issued_at = Date.now();
  const expires_at = issued_at + args.ttl_days * 24 * 3600 * 1000;
  const nonce = args.nonce ?? Math.random().toString(36).slice(2, 12);
  const canonical = `v1|${args.location_id}|${issued_at}|${expires_at}|${nonce}`;
  const sig = hmacSha256(secret, canonical);
  return `${canonical}|${sig}`;
}

export interface QrVerifyResult {
  valid: boolean;
  reason?: string;
  payload?: QrPayload;
}

export function verifyQrCode(secret: string, raw: string): QrVerifyResult {
  const parts = raw.split('|');
  if (parts.length !== 6 || parts[0] !== 'v1') {
    return { valid: false, reason: 'QR formatı geçersiz' };
  }
  const [version, location_id, issued_at_str, expires_at_str, nonce, sig] = parts as [
    string, string, string, string, string, string,
  ];
  const issued_at = Number(issued_at_str);
  const expires_at = Number(expires_at_str);
  if (!Number.isFinite(issued_at) || !Number.isFinite(expires_at)) {
    return { valid: false, reason: 'QR zaman alanları geçersiz' };
  }
  if (Date.now() > expires_at) {
    return { valid: false, reason: 'QR kod süresi dolmuş' };
  }
  const canonical = `${version}|${location_id}|${issued_at}|${expires_at}|${nonce}`;
  if (!verifyHmac(secret, canonical, sig)) {
    return { valid: false, reason: 'QR imzası geçersiz' };
  }
  return {
    valid: true,
    payload: { version, location_id, issued_at, expires_at, nonce },
  };
}
