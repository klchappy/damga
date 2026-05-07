import { hmacSha256, verifyHmac } from './hash';

/**
 * NFC tag içeriği:
 *   tag_id|location_id|nonce|hmac_signature
 *
 * Replay attack koruması için nonce + 90 gün TTL.
 * NFC tag basılırken bu içerik kodlanır, okunduğunda doğrulanır.
 */

export interface NfcPayload {
  tag_id: string;
  location_id: string;
  issued_at: number; // unix ms
  nonce: string;
}

/** NFC tag içeriğini imzala — admin yeni tag oluşturduğunda */
export function signNfcTag(secret: string, payload: NfcPayload): string {
  const canonical = `${payload.tag_id}|${payload.location_id}|${payload.issued_at}|${payload.nonce}`;
  const sig = hmacSha256(secret, canonical);
  return `${canonical}|${sig}`;
}

export interface NfcVerifyResult {
  valid: boolean;
  reason?: string;
  payload?: NfcPayload;
}

/** Çalışan NFC tap'ladığında */
export function verifyNfcTag(
  secret: string,
  rawNfcContent: string,
  opts?: { maxAgeMs?: number },
): NfcVerifyResult {
  const parts = rawNfcContent.split('|');
  if (parts.length !== 5) {
    return { valid: false, reason: 'NFC formatı geçersiz' };
  }
  const [tag_id, location_id, issued_at_str, nonce, sig] = parts as [
    string, string, string, string, string,
  ];
  const issued_at = Number(issued_at_str);
  if (!Number.isFinite(issued_at)) {
    return { valid: false, reason: 'NFC zaman damgası geçersiz' };
  }

  // TTL: 90 gün default
  const maxAge = opts?.maxAgeMs ?? 90 * 24 * 3600 * 1000;
  if (Date.now() - issued_at > maxAge) {
    return { valid: false, reason: 'NFC tag süresi dolmuş' };
  }

  const canonical = `${tag_id}|${location_id}|${issued_at}|${nonce}`;
  if (!verifyHmac(secret, canonical, sig)) {
    return { valid: false, reason: 'NFC imzası geçersiz' };
  }

  return {
    valid: true,
    payload: { tag_id, location_id, issued_at, nonce },
  };
}
