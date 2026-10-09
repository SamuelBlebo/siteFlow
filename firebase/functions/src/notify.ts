// Outbound messages. Credentials live only here, as Firebase secrets, never in the apps:
//   firebase functions:secrets:set WHATSAPP_TOKEN
//   firebase functions:secrets:set WHATSAPP_PHONE_ID
//   firebase functions:secrets:set EMAIL_API_KEY
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { waPhone } from '@siteflow/shared';

export const WA_TOKEN = defineSecret('WHATSAPP_TOKEN');
export const WA_PHONE_ID = defineSecret('WHATSAPP_PHONE_ID');
export const EMAIL_KEY = defineSecret('EMAIL_API_KEY');
export const SECRETS = [WA_TOKEN, WA_PHONE_ID, EMAIL_KEY];
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'SiteFlow <alerts@siteflow.app>';
const TEMPLATE_LANGUAGE = process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'en';

export type SendResult = { status: 'sent' | 'failed' | 'skipped'; error?: string; retry?: boolean };

// In the emulator (tests, local development) nothing leaves the machine
const testMode = () => process.env.FUNCTIONS_EMULATOR === 'true';
// Secret Manager refuses empty values, so "none" is the placeholder for "not set up yet"
const secret = (s: typeof WA_TOKEN) => { try { const v = s.value().trim(); return v.toLowerCase() === 'none' ? '' : v; } catch { return ''; } };
// Provider error bodies can repeat the phone number or email: keep them out of the logs
export const scrub = (text: string) => text.slice(0, 500).replace(/\+?\d[\d\s-]{6,}\d/g, '[number]').replace(/[^\s"'<>@]+@[^\s"'<>]+/g, '[email]');

// WhatsApp Cloud API (Meta). Messages the business starts must use an approved template,
// so every SiteFlow message is sent as a template with its parameters filled in.
export async function sendWhatsAppTemplate(to: string, template: string, params: string[]): Promise<SendResult> {
  if (testMode()) return { status: 'skipped', error: 'Test mode (emulator): not sent.' };
  const token = secret(WA_TOKEN), phoneId = secret(WA_PHONE_ID);
  if (!token || !phoneId) return { status: 'skipped', error: 'WhatsApp is not set up yet.' };
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: waPhone(to), type: 'template',
        template: { name: template, language: { code: TEMPLATE_LANGUAGE }, components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] },
      }),
    });
    if (res.ok) return { status: 'sent' };
    const body = await res.text();
    logger.warn('WhatsApp send failed', { status: res.status, body: scrub(body) });
    // 429 and 5xx are worth retrying; 4xx (bad number, template not approved) are not
    return { status: 'failed', error: `WhatsApp refused it (${res.status}).`, retry: res.status === 429 || res.status >= 500 };
  } catch (e) {
    logger.warn('WhatsApp send error', { error: String(e) });
    return { status: 'failed', error: 'Could not reach WhatsApp.', retry: true };
  }
}

// Email through Resend (swap for SendGrid or Mailgun here if you prefer)
export async function sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
  if (testMode()) return { status: 'skipped', error: 'Test mode (emulator): not sent.' };
  const key = secret(EMAIL_KEY);
  if (!key) return { status: 'skipped', error: 'Email is not set up yet.' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, text }),
    });
    if (res.ok) return { status: 'sent' };
    const body = await res.text();
    logger.warn('Email send failed', { status: res.status, body: scrub(body) });
    return { status: 'failed', error: `The email service refused it (${res.status}).`, retry: res.status === 429 || res.status >= 500 };
  } catch (e) {
    logger.warn('Email send error', { error: String(e) });
    return { status: 'failed', error: 'Could not reach the email service.', retry: true };
  }
}
