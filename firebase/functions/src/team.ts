import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import {
  DEFAULT_MODULES, ROLE_LABELS, assignableRoles, companySetupInput, inviteInput, isRole, isSiteScoped, paths, validate,
  type Role, type UserProfile,
} from '@siteflow/shared';

// First sign-up. Creates the company and the owner's profile on the server, so plan and
// modules can't be chosen by the client. Safe to call again if the first attempt failed.
export const createCompany = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const v = validate(companySetupInput, req.data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const { companyName, name } = v.data;
  const uid = req.auth.uid;
  const db = getFirestore();

  const userRef = db.doc(paths.user(uid));
  const companyRef = db.doc(paths.company(uid)); // an owner's company id is their uid
  await db.runTransaction(async (t) => {
    const existing = await t.get(userRef);
    if (existing.exists) {
      const p = existing.data() as UserProfile;
      if (p.companyId === uid && p.role === 'owner') return; // already set up
      throw new HttpsError('already-exists', 'This account already belongs to a company.');
    }
    t.set(companyRef, { name: companyName, ownerId: uid, plan: 'starter', modules: DEFAULT_MODULES, createdAt: FieldValue.serverTimestamp() });
    t.set(userRef, {
      companyId: uid, role: 'owner', name, email: req.auth?.token.email ?? '', siteIds: [], active: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { companyId: uid };
});

// Owner or admin adds a team member. Returns a temporary password to share with them.
export const inviteMember = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const db = getFirestore();
  const me = (await db.doc(paths.user(req.auth.uid)).get()).data() as UserProfile | undefined;
  if (!me || me.active === false || !isRole(me.role) || !assignableRoles(me.role).length) {
    throw new HttpsError('permission-denied', 'Only owners and admins can add team members.');
  }

  const v = validate(inviteInput, req.data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const { name, email, siteIds } = v.data;
  const role = v.data.role as Role;
  if (!assignableRoles(me.role).includes(role)) {
    throw new HttpsError('permission-denied', `You can't add someone as ${ROLE_LABELS[role].toLowerCase()}.`);
  }

  // Site-scoped roles get the sites chosen (only ones that exist in this company); others see all sites
  const valid: string[] = [];
  if (isSiteScoped(role)) {
    for (const sid of siteIds) if ((await db.doc(paths.site(me.companyId, sid)).get()).exists) valid.push(sid);
  }

  const tempPassword = randomBytes(9).toString('base64url');
  let uid: string;
  try {
    uid = (await getAuth().createUser({ email, password: tempPassword, displayName: name })).uid;
  } catch (e: any) {
    if (e?.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'That email already has a SiteFlow account.');
    if (e?.code === 'auth/invalid-email') throw new HttpsError('invalid-argument', 'Enter a valid email.');
    logger.error('inviteMember: createUser failed', { code: e?.code });
    throw new HttpsError('internal', 'Could not create the account.');
  }
  try {
    await db.doc(paths.user(uid)).set({
      companyId: me.companyId, role, name, email, siteIds: valid, active: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    // Don't leave a login with no profile behind
    await getAuth().deleteUser(uid).catch(() => {});
    logger.error('inviteMember: profile write failed', e);
    throw new HttpsError('internal', 'Could not create the account.');
  }
  await db.collection(paths.activity(me.companyId)).add({
    who: me.name, what: `added ${name} as ${ROLE_LABELS[role].toLowerCase()}`, at: FieldValue.serverTimestamp(),
  }).catch((e) => logger.warn('inviteMember: activity log failed', e));
  return { uid, tempPassword };
});
