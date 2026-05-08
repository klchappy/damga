import { hmacSha256, verifyHmac } from './hash';

/**
 * QR kod 2 farklı formatta encode edilebilir:
 *
 *   v1 (eski / arka uyumluluk):
 *     v1|location_id|issued_at|expires_at|nonce|hmac
 *     ZXing scanner ile okunur, /v1/stamp'e payload olarak gönderilir.
 *
 *   v2 (yeni / önerilen / proxy-attack dirençli):
 *     <client_url>/q/<location_id>?t=<base64url(canonical|sig)>
 *     Telefonun kamera uygulaması doğrudan tarayıcıyı açar → /q sayfası
 *     yüklenir → server-side GPS+geofence ZORUNLU doğrulama yapılır.
 *     Bu yöntemde QR fotoğraflanan kullanıcı evden okutsa bile GPS evi
 *     gösterdiği için reject edilir.
 *
 * Pipe-separated tutmak QR boyutunu küçültür (telefonun okumasını kolaylaştırır).
 */

export interface QrPayload {
  version: string;
  location_id: string;
  issued_at: number;
  expires_at: number;
  nonce: string;
}

/** v1: eski payload string formatı */
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

/**
 * v2: URL formatı. Telefon kamerası okuyunca tarayıcıda landing sayfası açılır.
 *
 * URL: <baseUrl>/q/<location_id>?t=<token>
 * token = base64url(`v2|location_id|issued_at|expires_at|nonce|hmac`)
 *
 * Server, /q endpoint'inde token'ı decode edip verifyQrUrlToken ile doğrular,
 * ardından kullanıcı session + GPS + geofence kontrolü ile damga vurur.
 */
export function signQrCodeUrl(
  secret: string,
  args: { location_id: string; ttl_days: number; baseUrl: string; nonce?: string },
): string {
  const issued_at = Date.now();
  const expires_at = issued_at + args.ttl_days * 24 * 3600 * 1000;
  const nonce = args.nonce ?? Math.random().toString(36).slice(2, 12);
  const canonical = `v2|${args.location_id}|${issued_at}|${expires_at}|${nonce}`;
  const sig = hmacSha256(secret, canonical);
  const token = base64UrlEncode(`${canonical}|${sig}`);
  const baseUrl = args.baseUrl.replace(/\/+$/, '');
  return `${baseUrl}/q/${args.location_id}?t=${token}`;
}

export interface QrVerifyResult {
  valid: boolean;
  reason?: string;
  payload?: QrPayload;
}

/** v1 payload string'ini doğrula (eski statik QR'lar için) */
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

/** v2 URL token'ını (base64url encoded) doğrula. */
export function verifyQrUrlToken(secret: string, token: string): QrVerifyResult {
  let decoded: string;
  try {
    decoded = base64UrlDecode(token);
  } catch {
    return { valid: false, reason: 'QR tokenı çözülemedi' };
  }
  const parts = decoded.split('|');
  if (parts.length !== 6 || parts[0] !== 'v2') {
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

function base64UrlEncode(s: string): string {
  return Buffer.from(s, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(
    s.replace(/-/g, '+').replace(/_/g, '/') + pad,
    'base64',
  ).toString('utf8');
}
