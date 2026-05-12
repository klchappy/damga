import { env } from '../config/env';
import { sendEmail } from '../lib/email';

const recipient = process.argv[2] ?? env.CONTACT_EMAIL;

const sentAt = new Date().toISOString();

try {
  const data = await sendEmail({
    to: recipient,
    subject: 'Damga test maili',
    text: `Damga mail altyapisi test edildi.\n\nZaman: ${sentAt}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2>Damga test maili</h2>
        <p>Damga mail altyapisi test edildi.</p>
        <p><strong>Zaman:</strong> ${sentAt}</p>
      </div>
    `,
  });

  console.log(JSON.stringify({ ok: true, to: recipient, id: data?.id ?? null }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        to: recipient,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
