#!/usr/bin/env node
/**
 * Supabase Auth template configurator — Damga.
 *
 * Türkçe karakter desteği için Node.js'ten UTF-8 safe PATCH gönderir
 * (Windows curl + cmd encoding sorunlarını bypass eder).
 *
 * Kullanım: node scripts/supabase-auth-templates.mjs
 */
const SBP = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF ?? 'tidsuaupjvtviewidbav';

if (!SBP) {
  console.error(
    'ERROR: SUPABASE_ACCESS_TOKEN env var gerekli (supabase.com/dashboard/account/tokens)',
  );
  process.exit(1);
}

const brand = '#7e22ce';
const wrapHtml = (titleTr, bodyHtml) => `<!DOCTYPE html>
<html lang="tr"><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f3ff;margin:0;padding:0;">
<div style="max-width:560px;margin:32px auto;padding:32px 24px;background:#fff;border-radius:12px;border:1px solid #e9d5ff;">
  <div style="text-align:center;margin-bottom:24px;">
    <div style="display:inline-block;width:48px;height:48px;background:${brand};color:#fff;border-radius:10px;line-height:48px;font-size:18px;font-weight:700;">Dm</div>
    <h1 style="margin:12px 0 0;color:${brand};font-size:18px;">Damga</h1>
  </div>
  <h2 style="color:${brand};margin-top:0;">${titleTr}</h2>
  ${bodyHtml}
  <hr style="border:none;border-top:1px solid #e9d5ff;margin:24px 0;">
  <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
    Damga — Personel Takip Platformu<br>
    <a href="https://damga.deploi.net" style="color:${brand};text-decoration:none;">damga.deploi.net</a>
  </p>
</div></body></html>`;

const button = (label, url) =>
  `<p style="text-align:center;margin:32px 0;"><a href="${url}" style="display:inline-block;background:${brand};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500;">${label}</a></p>`;

const payload = {
  rate_limit_email_sent: 30,
  // Subjects (Türkçe)
  mailer_subjects_confirmation: 'Damga — Hesap Doğrulama',
  mailer_subjects_invite: "Damga'ya Davet Edildin",
  mailer_subjects_magic_link: 'Damga — Giriş Linki',
  mailer_subjects_recovery: 'Damga — Şifre Sıfırlama',
  mailer_subjects_email_change: 'Damga — E-posta Değişikliği',
  mailer_subjects_reauthentication: 'Damga — Yeniden Kimlik Doğrulama',

  // Templates
  mailer_templates_magic_link_content: wrapHtml(
    'Giriş Linki',
    `<p>Aşağıdaki linke tıklayarak Damga'ya giriş yapabilirsin:</p>
    ${button('Giriş Yap', '{{ .ConfirmationURL }}')}
    <p style="color:#9ca3af;font-size:12px;">Bu maili sen istemediysen yok say.</p>`,
  ),
  mailer_templates_recovery_content: wrapHtml(
    'Şifre Sıfırlama',
    `<p>Şifre sıfırlama talebin alındı. Yeni şifre belirlemek için:</p>
    ${button('Yeni Şifre Belirle', '{{ .ConfirmationURL }}')}
    <p style="color:#9ca3af;font-size:12px;">Bu maili sen istemediysen yok say; şifren güvende.</p>`,
  ),
  mailer_templates_email_change_content: wrapHtml(
    'E-posta Değişikliği',
    `<p>E-posta adresini <strong>{{ .Email }}</strong> adresinden <strong>{{ .NewEmail }}</strong> adresine değiştirmek istiyorsun. Onaylamak için:</p>
    ${button('E-postayı Değiştir', '{{ .ConfirmationURL }}')}
    <p style="color:#9ca3af;font-size:12px;">Bu değişikliği sen yapmadıysan derhal destek ekibimize bildir.</p>`,
  ),
  mailer_templates_invite_content: wrapHtml(
    "Damga'ya Davet Edildin",
    `<p>Damga personel takip platformuna davet edildin. Hesabını oluşturmak için:</p>
    ${button('Daveti Kabul Et', '{{ .ConfirmationURL }}')}`,
  ),
  mailer_templates_confirmation_content: wrapHtml(
    'Hesap Doğrulama',
    `<p>Damga hesabını doğrulamak için aşağıdaki linke tıkla:</p>
    ${button('Hesabımı Doğrula', '{{ .ConfirmationURL }}')}`,
  ),
  mailer_templates_reauthentication_content: wrapHtml(
    'Yeniden Kimlik Doğrulama',
    `<p>Güvenlik için kimliğini yeniden doğrulamamız gerekiyor. Doğrulama kodun:</p>
    <p style="text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;color:${brand};">{{ .Token }}</p>`,
  ),
};

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${SBP}`,
    'Content-Type': 'application/json; charset=utf-8',
  },
  body: JSON.stringify(payload),
});
const data = await res.json();
if (!res.ok) {
  console.error('FAIL:', res.status, JSON.stringify(data).slice(0, 400));
  process.exit(1);
}
for (const k of [
  'mailer_subjects_magic_link',
  'mailer_subjects_recovery',
  'mailer_subjects_invite',
  'mailer_subjects_email_change',
  'smtp_host',
  'smtp_user',
  'smtp_admin_email',
  'rate_limit_email_sent',
]) {
  console.log(`${k}: ${JSON.stringify(data[k]).slice(0, 80)}`);
}
console.log('\nDONE');
