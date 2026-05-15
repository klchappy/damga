/**
 * Email gateway — Resend wrapper + graceful fallback.
 *
 * Env yoksa:
 *   - sendEmail() → log + return { delivered: 'fallback_link' }
 *   - Caller (users.ts, auth.ts) action_link'i UI'a göster
 *
 * Env varsa (RESEND_API_KEY + EMAIL_FROM):
 *   - Resend API → POST + return { delivered: 'email', message_id }
 *
 * Domain: damga.deploi.net (Cloudflare DNS + Resend verify)
 * Templates inline HTML — komplekleşince ayrı dosyaya çıkar.
 */
import { Resend } from 'resend';
import { env, isConfigured } from '../config/env';
import { logger } from '../config/logger';

export const isEmailConfigured = isConfigured.email;

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string | string[];
  tag?: string;
}

export interface SendEmailResult {
  delivered: 'email' | 'fallback_link';
  message_id?: string;
}

let _resend: Resend | null = null;
function getResendClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  _resend ??= new Resend(env.RESEND_API_KEY);
  return _resend;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const client = getResendClient();
  if (!client || !env.EMAIL_FROM) {
    logger.warn(
      { to: params.to, subject: params.subject, tag: params.tag },
      'Email gateway not configured (RESEND_API_KEY+EMAIL_FROM) — fallback mode',
    );
    return { delivered: 'fallback_link' };
  }

  try {
    const content = params.html
      ? { html: params.html, ...(params.text ? { text: params.text } : {}) }
      : { text: params.text as string };

    const { data, error } = await client.emails.send({
      from: params.from ?? env.EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      replyTo: params.replyTo ?? env.SUPPORT_EMAIL,
      tags: params.tag ? [{ name: 'category', value: params.tag }] : undefined,
      ...content,
    });

    if (error) {
      logger.error({ err: error, to: params.to }, 'Resend send failed');
      return { delivered: 'fallback_link' };
    }

    return { delivered: 'email', message_id: data?.id };
  } catch (err) {
    logger.error({ err, to: params.to }, 'Resend network error');
    return { delivered: 'fallback_link' };
  }
}

// ============================================================================
// TEMPLATES
// ============================================================================

const BRAND_COLOR = '#f97316'; // Damga turuncu — orange-500
const BRAND_INITIALS = 'Dm';
const BRAND_NAME = 'Damga';
const BRAND_TAGLINE = 'Personel Takip ve Bordro Platformu';

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:#fff7ed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <div style="max-width:560px;margin:32px auto;padding:32px 24px;background:#fff;border-radius:12px;border:1px solid #fed7aa;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;width:48px;height:48px;background:${BRAND_COLOR};color:#fff;border-radius:10px;line-height:48px;font-size:18px;font-weight:700;letter-spacing:0.5px;">${BRAND_INITIALS}</div>
      <h1 style="margin:12px 0 0;color:${BRAND_COLOR};font-size:18px;">${BRAND_NAME}</h1>
    </div>
    ${body}
    <hr style="border:none;border-top:1px solid #fed7aa;margin:24px 0;">
    <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
      ${BRAND_NAME} — ${BRAND_TAGLINE}<br>
      Bu mail otomatik gönderildi; cevap vermenize gerek yok.<br>
      <a href="https://damga.deploi.net" style="color:${BRAND_COLOR};text-decoration:none;">damga.deploi.net</a>
    </p>
  </div>
</body>
</html>`;
}

function button(label: string, url: string): string {
  return `<a href="${escape(url)}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500;">${escape(label)}</a>`;
}

// --- Invite mail -----------------------------------------------------------

export interface InviteEmailParams {
  to: string;
  inviterName?: string | null;
  orgName: string;
  roleLabel: string;
  acceptUrl: string;
  expiresAt?: Date | null;
}

export function sendInviteEmail(p: InviteEmailParams): Promise<SendEmailResult> {
  const expiresStr = p.expiresAt ? p.expiresAt.toLocaleString('tr-TR') : null;
  const body = `
    <h2 style="color:${BRAND_COLOR};margin-top:0;">${BRAND_NAME}'ya Davet Edildin</h2>
    <p>Merhaba,</p>
    <p>
      <strong>${escape(p.orgName)}</strong> seni ${BRAND_NAME}'ya
      <strong>${escape(p.roleLabel)}</strong> olarak davet etti.
    </p>
    <p style="text-align:center;margin:32px 0;">${button('Şifre Belirle ve Giriş Yap', p.acceptUrl)}</p>
    <p style="color:#6b7280;font-size:13px;">
      Buton çalışmıyorsa şu linki tarayıcına yapıştır:<br>
      <a href="${escape(p.acceptUrl)}" style="color:${BRAND_COLOR};word-break:break-all;">${escape(p.acceptUrl)}</a>
    </p>
    ${
      expiresStr
        ? `<p style="color:#9ca3af;font-size:12px;">Davet süresi: <strong>${escape(expiresStr)}</strong></p>`
        : ''
    }`;

  return sendEmail({
    to: p.to,
    subject: `${p.orgName} seni ${BRAND_NAME}'ya davet etti`,
    html: wrapHtml(`${BRAND_NAME} Daveti`, body),
    text:
      `${p.orgName} seni ${BRAND_NAME}'ya ${p.roleLabel} olarak davet etti.\n\n` +
      `Şifre belirleme linki: ${p.acceptUrl}` +
      (expiresStr ? `\n\nSüre: ${expiresStr}` : ''),
    tag: 'invite',
  });
}

// --- Password reset mail ---------------------------------------------------

export interface PasswordResetEmailParams {
  to: string;
  resetUrl: string;
  expiresAt?: Date | null;
}

export function sendPasswordResetEmail(
  p: PasswordResetEmailParams,
): Promise<SendEmailResult> {
  const expiresStr = p.expiresAt ? p.expiresAt.toLocaleString('tr-TR') : null;
  const body = `
    <h2 style="color:${BRAND_COLOR};margin-top:0;">Şifre Sıfırlama</h2>
    <p>Şifre sıfırlama talebin alındı.</p>
    <p style="text-align:center;margin:32px 0;">${button('Yeni Şifre Belirle', p.resetUrl)}</p>
    <p style="color:#6b7280;font-size:13px;">
      Buton çalışmıyorsa şu linki tarayıcına yapıştır:<br>
      <a href="${escape(p.resetUrl)}" style="color:${BRAND_COLOR};word-break:break-all;">${escape(p.resetUrl)}</a>
    </p>
    <p style="color:#9ca3af;font-size:12px;">
      ${expiresStr ? `Link süresi: <strong>${escape(expiresStr)}</strong> — sonra link geçersizleşir.<br>` : ''}
      Bu maili sen istemediysen yok say; şifren güvende.
    </p>`;

  return sendEmail({
    to: p.to,
    subject: `${BRAND_NAME} — Şifre Sıfırlama`,
    html: wrapHtml('Şifre Sıfırlama', body),
    text:
      `${BRAND_NAME} şifre sıfırlama: ${p.resetUrl}` +
      (expiresStr ? `\n\nSüre: ${expiresStr}` : ''),
    tag: 'password_reset',
  });
}

// --- Generic notification mail ---------------------------------------------

export interface NotificationEmailParams {
  to: string;
  title: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
  tag?: string;
}

export function sendNotificationEmail(
  p: NotificationEmailParams,
): Promise<SendEmailResult> {
  const html = `
    <h2 style="color:${BRAND_COLOR};margin-top:0;">${escape(p.title)}</h2>
    <div style="white-space:pre-line;color:#374151;line-height:1.6;">${escape(p.body)}</div>
    ${
      p.actionUrl
        ? `<p style="text-align:center;margin:32px 0;">${button(p.actionLabel ?? 'Görüntüle', p.actionUrl)}</p>`
        : ''
    }`;

  return sendEmail({
    to: p.to,
    subject: `${BRAND_NAME} — ${p.title}`,
    html: wrapHtml(p.title, html),
    text: p.body + (p.actionUrl ? `\n\n${p.actionUrl}` : ''),
    tag: p.tag ?? 'notification',
  });
}
