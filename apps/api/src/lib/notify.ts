/**
 * Çoklu kanal bildirim helper'ları — şifre/link/yeni şifre iletimi için.
 *
 * Strateji: gateway env var set'liyse gerçekten gönder; yoksa "fallback URL" döndür
 * — admin client tarafında manuel paylaşım yapar (kopyala/share butonları ile).
 *
 * Bu sayede production'da gateway eklendikçe akış otomatik aktif olur, yokken
 * ürün hala kullanılabilir kalır.
 */

import { env } from '../config/env';
import { logger } from '../config/logger';

interface SendResult {
  /** Gerçek gönderim başarıyla yapıldı mı */
  sent: boolean;
  /** Fallback için kullanılabilir paylaşım URL'si (wa.me / sms: / mailto:) */
  fallback_url?: string;
  /** Hata mesajı (sent=false ve gateway konfigli ise) */
  error?: string;
}

export interface SendOptions {
  to: string;
  message: string;
  /** Mesajın içine gömülü link (notification için ayrı tutulur) */
  link?: string;
}

/**
 * SMS — env.SMS_GATEWAY_URL set'liyse POST atılır:
 *   POST <SMS_GATEWAY_URL>
 *   Authorization: Bearer <SMS_GATEWAY_TOKEN>
 *   { to, message }
 *
 * Yoksa: native sms: URL'si dönülür (mobilde tıklayınca SMS app açılır)
 */
export async function sendSms(opts: SendOptions): Promise<SendResult> {
  const gateway = process.env.SMS_GATEWAY_URL;
  const token = process.env.SMS_GATEWAY_TOKEN;
  const fallback = `sms:${opts.to}?body=${encodeURIComponent(opts.message)}`;

  if (!gateway) {
    return { sent: false, fallback_url: fallback };
  }
  try {
    const res = await fetch(gateway, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ to: opts.to, message: opts.message }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn({ status: res.status, body: text.slice(0, 200) }, 'SMS gateway hatası');
      return { sent: false, fallback_url: fallback, error: `Gateway ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    logger.warn({ err: e }, 'SMS gateway exception');
    return { sent: false, fallback_url: fallback, error: 'Network error' };
  }
}

/**
 * WhatsApp — env.WHATSAPP_API_URL set'liyse Cloud API'ye POST atılır.
 * Yoksa wa.me share URL'si dönülür (kullanıcı tıklayınca mesaj otomatik hazır gelir)
 *
 * Cloud API formatı (Meta WhatsApp Business):
 *   POST <WHATSAPP_API_URL>/messages
 *   Authorization: Bearer <WHATSAPP_TOKEN>
 *   { messaging_product: "whatsapp", to: <e164>, type: "text", text: { body: <message> } }
 */
export async function sendWhatsApp(opts: SendOptions): Promise<SendResult> {
  const apiUrl = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_TOKEN;
  // wa.me numarası "+" olmadan; mesajı encode et
  const cleanPhone = opts.to.replace(/[^\d]/g, '');
  const fallback = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(opts.message)}`;

  if (!apiUrl || !token) {
    return { sent: false, fallback_url: fallback };
  }
  try {
    const res = await fetch(`${apiUrl.replace(/\/+$/, '')}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'text',
        text: { body: opts.message },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn(
        { status: res.status, body: text.slice(0, 200) },
        'WhatsApp gateway hatası',
      );
      return { sent: false, fallback_url: fallback, error: `WhatsApp ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    logger.warn({ err: e }, 'WhatsApp gateway exception');
    return { sent: false, fallback_url: fallback, error: 'Network error' };
  }
}

export function buildPasswordMessage(args: {
  recipientName: string;
  password: string;
  signInUrl: string;
}) {
  return [
    `Merhaba ${args.recipientName},`,
    '',
    'Damga şifren güncellendi:',
    '',
    `Şifre: ${args.password}`,
    `Giriş: ${args.signInUrl}`,
    '',
    'İlk girişten sonra Profil → Şifre değiştir kısmından kendi şifrene geçmen önerilir.',
  ].join('\n');
}

export function buildLinkMessage(args: {
  recipientName: string;
  link: string;
  ttlMinutes?: number;
}) {
  return [
    `Merhaba ${args.recipientName},`,
    '',
    'Damga şifre belirleme linki:',
    args.link,
    '',
    args.ttlMinutes
      ? `Bu link tek kullanımlık ve ${args.ttlMinutes} dakika geçerli.`
      : 'Bu link tek kullanımlık.',
  ].join('\n');
}

// env'in kullanılmadığı uyarısını silmek için (CLIENT_URL signInUrl'i çağırırken
// route içinde import ediliyor).
export const _unused = env;
