// Outbound messages. Keys are stored as Firebase secrets:
//   firebase functions:secrets:set WHATSAPP_TOKEN
//   firebase functions:secrets:set WHATSAPP_PHONE_ID
//   firebase functions:secrets:set EMAIL_API_KEY
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { waPhone } from '@siteflow/shared';

export const WA_TOKEN = defineSecret('WHATSAPP_TOKEN');
export const WA_PHONE_ID = defineSecret('WHATSAPP_PHONE_ID');
export const EMAIL_KEY = defineSecret('EMAIL_API_KEY');
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'SiteFlow <reports@siteflow.app>';

// WhatsApp Cloud API (Meta). Messages the business starts must use an approved template;
// free text like this only works within 24 hours of the user's last message.
// For production, create a "report_reminder" template and send it with type: 'template'.
export async function sendWhatsApp(to: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID.value()}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN.value()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: waPhone(to), type: 'text', text: { body: text } }),
  });
  if (!res.ok) logger.warn('WhatsApp send failed', { to, status: res.status, body: await res.text() });
}

// Email through Resend (swap for SendGrid or Mailgun here if you prefer)
export async function sendEmail(to: string, subject: string, text: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${EMAIL_KEY.value()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, text }),
  });
  if (!res.ok) logger.warn('Email send failed', { to, status: res.status, body: await res.text() });
}
