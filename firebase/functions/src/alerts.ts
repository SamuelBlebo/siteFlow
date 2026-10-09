import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import {
  ISSUE_PRIORITY_LABELS, SAMPLE_PREFIX, paths, recipientsFor, type Issue, type Material, type MaterialLog, type Report,
} from '@siteflow/shared';
import { companyMembers, deliver } from './deliver';
import { SECRETS } from './notify';

const APP_URL = process.env.APP_URL ?? 'https://siteflow.app';
// Sample projects (Explore with sample data) never send messages
const sample = (sid: string) => sid.startsWith(SAMPLE_PREFIX);

// A daily report came in (off by default: can be many messages)
export const onReportSent = onDocumentCreated({ document: 'companies/{cid}/sites/{sid}/reports/{rid}', secrets: SECRETS }, async (event) => {
  const { cid, sid, rid } = event.params;
  const r = event.data?.data() as Report | undefined;
  if (!r || sample(sid)) return;
  const members = await companyMembers(cid);
  await deliver({
    cid, kind: 'report_submitted', key: `report_${sid}_${rid}`, siteId: sid,
    values: { who: r.createdByName, site: r.siteName, progress: r.progress, workers: r.workersPresent, issues: r.issues ? `Issue: ${r.issues}` : 'No issues reported.' },
    subject: `Daily report: ${r.siteName}`,
    recipients: recipientsFor('report_submitted', members, { siteId: sid, actorId: r.createdBy }),
  });
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
