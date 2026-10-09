import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  ROLE_LABELS, SAMPLE_PREFIX, can, isRole, isSiteScoped, paths, prettyDate, reportRequestInput, reportRequestRefInput, validate,
  type Role, type UserProfile,
} from '@siteflow/shared';
import { checkLimit } from './limits';
import { companyMembers, deliver } from './deliver';
import { SECRETS } from './notify';

// Report requests: an owner, admin or project manager asks named people for the daily report on a
// project, by WhatsApp and/or email. The request shows in the app until that person's report for the
// day comes in (onReportSent marks it done), or the person who asked cancels it.

const callOpts = { enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };
const APP_URL = process.env.APP_URL ?? 'https://siteflow.app';

function parse<T extends Parameters<typeof validate>[0]>(schema: T, data: unknown) {
  const v = validate(schema, data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  return v.data;
}

async function requester(db: Firestore, uid: string | undefined) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const snap = await db.doc(paths.user(uid)).get();
  const me = snap.data() as UserProfile | undefined;
  if (!me || me.active === false || !isRole(me.role) || !can(me.role, 'sites.manage')) {
    throw new HttpsError('permission-denied', 'Only owners, admins and project managers can ask for reports.');
  }
  return { ...me, id: snap.id };
}

export const requestReport = onCall({ ...callOpts, secrets: SECRETS }, async (req) => {
  const db = getFirestore();
  const me = await requester(db, req.auth?.uid);
  await checkLimit(me.id, 'requests');
  const input = parse(reportRequestInput, req.data);
  const cid = me.companyId;
  const site = (await db.doc(paths.site(cid, input.siteId)).get()).data();
  if (!site) throw new HttpsError('not-found', 'That project was not found.');
  if (site.status === 'closed') throw new HttpsError('failed-precondition', 'This project is closed; no reports can be sent.');

  // Only people who can send reports on this project
  const members = await companyMembers(cid);
  const ok = (m: (typeof members)[number]) => m.active !== false && m.id !== me.id && can(m.role, 'site.work')
    && (!isSiteScoped(m.role) || !!m.siteIds?.includes(input.siteId));
  const chosen = input.uids.map((id) => members.find((m) => m.id === id));
  const bad = chosen.filter((m) => !m || !ok(m));
  if (bad.length) throw new HttpsError('failed-precondition', 'Someone you chose cannot send reports on this project.');

  const sample = input.siteId.startsWith(SAMPLE_PREFIX); // sample projects never send messages
  const ids: string[] = [];
  for (const m of chosen as NonNullable<(typeof chosen)[number]>[]) {
    const ref = db.collection(paths.sub(cid, input.siteId, 'reportRequests')).doc();
    await ref.set({
      siteId: input.siteId, siteName: site.name, to: m.id, toName: m.name, toRole: m.role,
      by: me.id, byName: me.name, byRole: me.role, due: input.due, note: input.note,
      channels: { whatsapp: input.whatsapp, email: input.email }, status: 'open', reportId: null, createdAt: FieldValue.serverTimestamp(),
    });
    ids.push(ref.id);
    if (sample || (!input.whatsapp && !input.email)) continue;
    const role = ROLE_LABELS[me.role as Role].toLowerCase();
    const due = prettyDate(input.due);
    await deliver({
      cid, kind: 'report_request', key: `request_${ref.id}`, siteId: input.siteId,
      channels: { whatsapp: input.whatsapp, email: input.email },
      values: { name: m.name.split(' ')[0], who: me.name, role, site: site.name, due, note: input.note ? `Note: ${input.note}` : '' },
      subject: `${me.name} asked for the daily report: ${site.name}`,
      emailText: `Hi ${m.name.split(' ')[0]},\n\n${me.name} (${role}) has asked you for the daily report for ${site.name} for ${due}.${input.note ? `\n\nNote: ${input.note}` : ''}\n\nSend it from the SiteFlow app, or here: ${APP_URL}/work/${input.siteId}?tab=report\n\nSiteFlow`,
      recipients: [m],
    });
  }
  return { requested: ids.length };
});

// The person who asked (or an owner or admin) cancels a request that is still open
export const cancelReportRequest = onCall(callOpts, async (req) => {
  const db = getFirestore();
  const me = await requester(db, req.auth?.uid);
  const { siteId, id } = parse(reportRequestRefInput, req.data);
  const ref = db.doc(paths.subDoc(me.companyId, siteId, 'reportRequests', id));
  const r = (await ref.get()).data();
  if (!r) throw new HttpsError('not-found', 'That request was not found.');
  if (r.by !== me.id && me.role !== 'owner' && me.role !== 'admin') throw new HttpsError('permission-denied', 'Only the person who asked can cancel it.');
  if (r.status !== 'open') return { cancelled: false };
  await ref.update({ status: 'cancelled', doneAt: FieldValue.serverTimestamp() });
  return { cancelled: true };
});

// A report came in: that person's open requests on the project for that day or earlier are done
export async function fulfilRequests(cid: string, sid: string, report: { createdBy: string; date: string }, reportId: string) {
  const db = getFirestore();
  const open = await db.collection(paths.sub(cid, sid, 'reportRequests')).where('to', '==', report.createdBy).where('status', '==', 'open').get();
  await Promise.all(open.docs.filter((d) => d.data().due <= report.date)
    .map((d) => d.ref.update({ status: 'done', reportId, doneAt: FieldValue.serverTimestamp() })));
}
