import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { can, deleteProjectInput, paths, validate } from '@siteflow/shared';
import { checkLimit } from './limits';
import { actorOf } from './members';

const callOpts = { enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };
const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

// The owner deletes a project for good: the project, everything recorded on it (reports, photos,
// issues, attendance, materials, money, drawings) and its files. Closing a project keeps all of
// that; this is for projects added by mistake or no longer wanted. The owner types the name to confirm.
export const deleteProject = onCall({ ...callOpts, timeoutSeconds: 300, memory: '512MiB' }, async (req) => {
  const v = validate(deleteProjectInput, req.data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const { siteId, confirmName } = v.data;
  const db = getFirestore();
  const me = await actorOf(db, req.auth?.uid);
  if (!can(me.role, 'company.settings')) throw new HttpsError('permission-denied', 'Only the owner can delete a project.');
  await checkLimit(me.id, 'deleteProject');
  const cid = me.companyId;
  const ref = db.doc(paths.site(cid, siteId));
  const site = (await ref.get()).data();
  if (!site) throw new HttpsError('not-found', 'That project was not found. It may already be deleted.');
  if (!sameName(site.name, confirmName)) throw new HttpsError('failed-precondition', 'The name you typed does not match the project name.');

  await ref.update({ removing: true }); // the spending trigger skips deletes on a project being removed
  await db.recursiveDelete(ref);
  // Its files: report and issue photos, drawings
  await getStorage().bucket().deleteFiles({ prefix: `${paths.site(cid, siteId)}/` })
    .catch((e) => logger.warn('deleteProject: some files were not removed', { cid, siteId, error: String(e) }));
  // People assigned to it keep their other projects
  const members = await db.collection(paths.members(cid)).where('siteIds', 'array-contains', siteId).get();
  await Promise.all(members.docs.map((m) => m.ref.update({ siteIds: FieldValue.arrayRemove(siteId) })));
  await db.collection(paths.activity(cid)).add({ who: me.name, whoId: me.id, what: `deleted the project ${site.name}`, at: FieldValue.serverTimestamp() });
  logger.info('Project deleted', { cid, siteId, by: me.id });
  return { deleted: true };
});
