import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { inviteInput, paths, validate, type UserProfile } from '@siteflow/shared';

// Owner or manager adds a team member. Returns a temporary password to share with them.
export const inviteMember = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const db = getFirestore();
  const me = (await db.doc(paths.user(req.auth.uid)).get()).data() as UserProfile | undefined;
  if (!me || !['owner', 'manager'].includes(me.role)) throw new HttpsError('permission-denied', 'Only owners and managers can add team members.');

  const v = validate(inviteInput, req.data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const { name, email, role, siteIds } = v.data;

  const valid: string[] = [];
  for (const sid of siteIds) if ((await db.doc(paths.site(me.companyId, sid)).get()).exists) valid.push(sid);

  const tempPassword = randomBytes(6).toString('base64url') + '9a';
  let uid: string;
  try {
    uid = (await getAuth().createUser({ email, password: tempPassword, displayName: name })).uid;
  } catch (e: any) {
    if (e.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'That email already has a SiteFlow account.');
    throw new HttpsError('internal', 'Could not create the account.');
  }
  await db.doc(paths.user(uid)).set({ companyId: me.companyId, role, name, email, siteIds: valid, createdAt: FieldValue.serverTimestamp() });
  await db.collection(paths.activity(me.companyId)).add({ who: me.name, what: `added ${name} as ${role === 'site' ? 'site team' : 'manager'}`, at: FieldValue.serverTimestamp() });
  return { uid, tempPassword };
});
