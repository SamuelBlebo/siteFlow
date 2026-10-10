import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  REVIEW_ITEMS, ROLE_LABELS, SAMPLE_PREFIX, can, paths, prettyDate, reportChangesInput, reviewText, validate,
  type Report, type ReportReview, type Role,
} from '@siteflow/shared';
import { actorOf } from './members';
import { checkLimit } from './limits';
import { companyMembers, deliver } from './deliver';
import { SECRETS } from './notify';

// Sending a daily report back to its author with what to change. Owners, admins and project managers
// tick what is needed (photos, workers, ...) and add a note; the author is told by WhatsApp and/or
// email and in the app, updates the report (the rules allow that only while changes are asked for),
// and the person who asked is told it was updated.

const callOpts = { enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };
const APP_URL = process.env.APP_URL ?? 'https://siteflow.app';

export const requestReportChanges = onCall({ ...callOpts, secrets: SECRETS }, async (req) => {
  const v = validate(reportChangesInput, req.data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const { siteId, reportId, items, note, whatsapp, email } = v.data;
  const db = getFirestore();
  const me = await actorOf(db, req.auth?.uid);
  if (!can(me.role, 'sites.manage')) throw new HttpsError('permission-denied', 'Only owners, admins and project managers can send a report back for changes.');
  await checkLimit(me.id, 'requests');
  const cid = me.companyId;
  const ref = db.doc(paths.subDoc(cid, siteId, 'reports', reportId));
  const r = (await ref.get()).data() as Report | undefined;
  if (!r) throw new HttpsError('not-found', 'That report was not found.');
  const site = (await db.doc(paths.site(cid, siteId)).get()).data();
  if (site?.status === 'closed') throw new HttpsError('failed-precondition', 'This project is closed, so its reports can no longer be changed.');

  const review: ReportReview = {
    status: 'changes_requested', items, note, by: me.id, byName: me.name, byRole: me.role, channels: { whatsapp, email },
  };
  await ref.update({ review: { ...review, at: FieldValue.serverTimestamp() } });

  const author = (await companyMembers(cid)).find((m) => m.id === r.createdBy);
  if (author && author.active !== false && !siteId.startsWith(SAMPLE_PREFIX) && (whatsapp || email)) {
    const changes = reviewText({ items, note });
    const role = ROLE_LABELS[me.role as Role].toLowerCase();
    const day = prettyDate(r.date);
    await deliver({
      cid, kind: 'report_changes', key: `changes_${reportId}_${Date.now()}`, siteId,
      channels: { whatsapp, email },
      values: { name: author.name.split(' ')[0], who: me.name, role, date: day, site: r.siteName, changes },
      subject: `Please update your daily report: ${r.siteName}, ${day}`,
      emailText: `Hi ${author.name.split(' ')[0]},\n\n${me.name} (${role}) asked you to update your daily report for ${r.siteName} on ${day}.\n\nWhat to change:\n${items.map((i) => `- ${REVIEW_ITEMS[i]}`).join('\n')}${note ? `\n\nNote: ${note}` : ''}\n\nUpdate it in the SiteFlow app, or here: ${APP_URL}/reports/${siteId}/${reportId}?edit=1\n\nSiteFlow`,
      recipients: [author],
    });
  }
  return { ok: true };
});

// The author updated a report that was sent back: tell the person who asked
export const onReportReviewed = onDocumentUpdated({ document: 'companies/{cid}/sites/{sid}/reports/{rid}', secrets: SECRETS }, async (event) => {
  const { cid, sid, rid } = event.params;
  const before = event.data?.before.data() as Report | undefined;
  const after = event.data?.after.data() as Report | undefined;
  if (!before?.review || !after?.review) return;
  if (!(before.review.status === 'changes_requested' && after.review.status === 'updated')) return;
  if (sid.startsWith(SAMPLE_PREFIX)) return;
  const ch = after.review.channels || { whatsapp: true, email: true };
  if (!ch.whatsapp && !ch.email) return;
  const asker = (await companyMembers(cid)).find((m) => m.id === after.review!.by);
  if (!asker || asker.active === false) return;
  const day = prettyDate(after.date);
  await deliver({
    cid, kind: 'report_updated', key: `updated_${rid}_${Date.now()}`, siteId: sid, channels: ch,
    values: { who: after.createdByName, date: day, site: after.siteName },
    subject: `${after.createdByName} updated the daily report: ${after.siteName}, ${day}`,
    emailText: `${after.createdByName} updated the daily report for ${after.siteName} on ${day}, as you asked (${reviewText(after.review)}).\n\nSee it here: ${APP_URL}/reports/${sid}/${rid}\n\nSiteFlow`,
    recipients: [asker],
  });
  await getFirestore().collection(paths.activity(cid)).add({ who: after.createdByName, whoId: after.createdBy, what: `updated the daily report for ${after.siteName} on ${day} after a request for changes`, at: FieldValue.serverTimestamp() }).catch(() => {});
});
