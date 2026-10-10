import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import {
  ISSUE_PRIORITY_LABELS, SAMPLE_PREFIX, paths, recipientsFor, type Issue, type Material, type MaterialLog, type Report,
} from '@siteflow/shared';
import { companyMembers, deliver } from './deliver';
import { SECRETS } from './notify';
import { fulfilRequests } from './requests';
import { mailIssue, mailReport } from './mail';

const APP_URL = process.env.APP_URL ?? 'https://siteflow.app';
// Sample projects (Explore with sample data) never send messages
const sample = (sid: string) => sid.startsWith(SAMPLE_PREFIX);

// A daily report came in: emailed to the people who want each report (a thread per project and
// week), and on WhatsApp if the company switched that on (off by default: can be many messages)
export const onReportSent = onDocumentCreated({ document: 'companies/{cid}/sites/{sid}/reports/{rid}', secrets: SECRETS }, async (event) => {
  const { cid, sid, rid } = event.params;
  const r = event.data?.data() as Report | undefined;
  if (!r) return;
  await fulfilRequests(cid, sid, r, rid); // anyone who asked for this report sees it has come in
  if (sample(sid)) return;
  const members = await companyMembers(cid);
  await deliver({
    cid, kind: 'report_submitted', key: `report_${sid}_${rid}`, siteId: sid,
    values: { who: r.createdByName, site: r.siteName, progress: r.progress, workers: r.workersPresent, issues: r.issues ? `Issue: ${r.issues}` : 'No issues reported.' },
    subject: `Daily report: ${r.siteName}`,
    recipients: recipientsFor('report_submitted', members, { siteId: sid, actorId: r.createdBy }),
  });
  await mailReport(cid, sid, rid, r);
});

// An issue became critical, or was given to someone
export const onIssueChanged = onDocumentWritten({ document: 'companies/{cid}/sites/{sid}/issues/{iid}', secrets: SECRETS }, async (event) => {
  const { cid, sid, iid } = event.params;
  const before = event.data?.before.exists ? (event.data.before.data() as Issue) : null;
  const after = event.data?.after.exists ? (event.data.after.data() as Issue) : null;
  if (!after || sample(sid)) return;
  const members = await companyMembers(cid);
  const created = !before;

  if (after.priority === 'critical' && (created || before?.priority !== 'critical') && after.status !== 'closed') {
    await deliver({
      cid, kind: 'critical_issue', key: `critical_${iid}`, siteId: sid,
      values: { site: after.siteName, title: after.title, who: after.createdByName },
      subject: `Critical issue at ${after.siteName}: ${after.title}`,
      emailText: `${after.title}\n\n${after.description || ''}\n\nSite: ${after.siteName}\nReported by: ${after.createdByName}\n\nOpen it: ${APP_URL}/issues/${sid}/${iid}`,
      recipients: recipientsFor('critical_issue', members, { siteId: sid, actorId: created ? after.createdBy : undefined }),
    });
  }
  // The issue's email thread: raised, given to someone, and status changes (comments: mail.ts)
  const actor = created ? after.createdBy : (after as Issue & { updatedBy?: string }).updatedBy;
  const actorName = (after as Issue & { updatedByName?: string }).updatedByName || 'Someone';
  // Same change, same key: a retried trigger never emails twice
  const at = (after as Issue & { updatedAt?: { toMillis?: () => number } }).updatedAt?.toMillis?.() ?? 0;
  if (created) await mailIssue(cid, sid, iid, after, { kind: 'created' }, `imail_${iid}_new`, actor);
  else {
    if (after.assignedTo && after.assignedTo !== before?.assignedTo) await mailIssue(cid, sid, iid, after, { kind: 'assigned', by: actorName, to: after.assignedToName || 'someone' }, `imail_${iid}_a_${after.assignedTo}_${at}`, actor);
    if (after.status !== before?.status) {
      const by = after.status === 'resolved' ? after.resolvedByName || actorName : actorName;
      await mailIssue(cid, sid, iid, after, { kind: 'status', by, to: after.status }, `imail_${iid}_s_${after.status}_${at}`, after.status === 'resolved' ? after.resolvedBy || actor : actor);
    }
  }
  if (after.assignedTo && after.assignedTo !== before?.assignedTo) {
    await deliver({
      cid, kind: 'issue_assigned', key: `assigned_${iid}_${after.assignedTo}`, siteId: sid,
      values: { who: created ? after.createdByName : 'Your manager', site: after.siteName, title: after.title, priority: ISSUE_PRIORITY_LABELS[after.priority].toLowerCase() },
      subject: `Issue for you at ${after.siteName}: ${after.title}`,
      recipients: recipientsFor('issue_assigned', members, { assignedTo: after.assignedTo }),
    });
  }
});

// A material dropped below its reorder level (once each time it crosses the line)
export const onStockChanged = onDocumentUpdated({ document: 'companies/{cid}/sites/{sid}/materials/{mid}', secrets: SECRETS }, async (event) => {
  const { cid, sid, mid } = event.params;
  const before = event.data?.before.data() as Material | undefined;
  const after = event.data?.after.data() as Material | undefined;
  if (!before || !after || !(after.reorderLevel > 0) || after.active === false || sample(sid)) return;
  if (!(before.stock >= after.reorderLevel && after.stock < after.reorderLevel)) return;
  const db = getFirestore();
  const site = (await db.doc(paths.site(cid, sid)).get()).data();
  const log = after.lastLogId ? (await db.doc(paths.subDoc(cid, sid, 'materialLogs', after.lastLogId)).get()).data() as MaterialLog | undefined : undefined;
  const members = await companyMembers(cid);
  await deliver({
    cid, kind: 'low_stock', key: `low_${mid}_${after.lastLogId || Date.now()}`, siteId: sid,
    values: { material: after.name, site: site?.name || 'site', stock: `${after.stock} ${after.unit}`, reorder: `${after.reorderLevel} ${after.unit}` },
    subject: `${after.name} running low at ${site?.name || 'site'}`,
    recipients: recipientsFor('low_stock', members, { siteId: sid, actorId: log?.createdBy }),
  });
});
