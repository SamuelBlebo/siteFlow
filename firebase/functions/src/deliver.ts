import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import {
  NOTIFICATIONS, maskContact, notificationRule, notificationText, paths, templateParams,
  type Company, type Member, type NotificationKind, type UserProfile,
} from '@siteflow/shared';
import { SECRETS, sendEmail, sendWhatsAppTemplate, type SendResult } from './notify';

const MAX_ATTEMPTS = 3;
export type Recipient = Pick<Member, 'name' | 'phone' | 'email'> & { id?: string };

// Active members of a company, as notification recipients
export async function companyMembers(cid: string): Promise<Member[]> {
  const snap = await getFirestore().collection(paths.users()).where('companyId', '==', cid).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<UserProfile, 'id'>) }));
}

const docId = (s: string) => s.replace(/[^\w-]/g, '_').slice(0, 300);

async function attempt(ref: DocumentReference, send: () => Promise<SendResult>) {
  const r = await send();
  await ref.update({
    status: r.status, error: r.error || '', retry: !!r.retry, attempts: FieldValue.increment(1),
    ...(r.status === 'sent' ? { sentAt: FieldValue.serverTimestamp() } : {}),
  });
  return r;
}

const sender = (channel: 'whatsapp' | 'email', address: string, kind: NotificationKind, params: string[], subject: string, text: string) =>
  () => (channel === 'whatsapp' ? sendWhatsAppTemplate(address, NOTIFICATIONS[kind].template.name, params) : sendEmail(address, subject, text));

// The one way SiteFlow sends a message. For each recipient and each channel the company has
// switched on: a log entry with a fixed id (so the same event never messages someone twice),
// then the send, then the result in the log. Failed sends that are worth retrying are retried later.
export async function deliver(d: {
  cid: string; kind: NotificationKind; key: string; siteId?: string;
  values: Record<string, string | number>; subject: string; emailText?: string; recipients: Recipient[];
}) {
  const db = getFirestore();
  const company = (await db.doc(paths.company(d.cid)).get()).data() as Company | undefined;
  const rule = notificationRule(company, d.kind);
  const params = templateParams(d.kind, d.values);
  const text = notificationText(d.kind, d.values);
  let sent = 0;
  for (const r of d.recipients) {
    for (const channel of ['whatsapp', 'email'] as const) {
      if (!rule[channel]) continue;
      const address = channel === 'whatsapp' ? r.phone : r.email;
      if (!address) continue;
      const ref = db.collection(paths.notifications(d.cid)).doc(docId(`${d.key}_${r.id || address}_${channel}`));
      const emailText = d.emailText || text;
      try {
        await ref.create({
          kind: d.kind, channel, to: maskContact(address), toName: r.name, siteId: d.siteId || null, text: channel === 'email' ? emailText : text,
          status: 'sending', attempts: 0, createdAt: FieldValue.serverTimestamp(),
          // kept for retries; the log is readable by owners and admins only
          address, params, subject: d.subject,
        });
      } catch (e: any) {
        if (e?.code === 6 || /already exists/i.test(String(e?.message))) continue; // this event already messaged this person
        throw e;
      }
      const res = await attempt(ref, sender(channel, address, d.kind, params, d.subject, emailText));
      if (res.status === 'sent') sent++;
    }
  }
  logger.info('Notification delivered', { cid: d.cid, kind: d.kind, key: d.key, recipients: d.recipients.length, sent });
  return sent;
}

// Every 30 minutes: try again messages that failed for a reason worth retrying (no signal to the provider, busy)
export async function retryFailedNotifications() {
  const snap = await getFirestore().collectionGroup('notifications').where('status', '==', 'failed').where('retry', '==', true).limit(200).get();
  let retried = 0;
  for (const doc of snap.docs) {
    const n = doc.data();
    if ((n.attempts || 0) >= MAX_ATTEMPTS) { await doc.ref.update({ retry: false }); continue; }
    await attempt(doc.ref, sender(n.channel, n.address, n.kind, n.params || [], n.subject || 'SiteFlow', n.text));
    retried++;
  }
  logger.info('Notification retries', { found: snap.size, retried });
  return retried;
}
export const retryNotifications = onSchedule({ schedule: 'every 30 minutes', secrets: SECRETS }, async () => { await retryFailedNotifications(); });
