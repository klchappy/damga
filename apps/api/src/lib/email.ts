import { Resend } from 'resend';
import { env } from '../config/env';

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string | string[];
};

let resend: Resend | null = null;

function getResendClient() {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  resend ??= new Resend(env.RESEND_API_KEY);
  return resend;
}

export async function sendEmail(input: SendEmailInput) {
  if (!input.html && !input.text) {
    throw new Error('Email html or text content is required');
  }

  const content = input.html
    ? { html: input.html, ...(input.text ? { text: input.text } : {}) }
    : { text: input.text as string };

  const { data, error } = await getResendClient().emails.send({
    from: input.from ?? env.EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    replyTo: input.replyTo ?? env.SUPPORT_EMAIL,
    ...content,
  });

  if (error) {
    throw new Error(`Resend email failed: ${error.message}`);
  }

  return data;
}
