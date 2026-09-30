import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import {
  DEFAULT_MODULES, ROLE_LABELS, assignableRoles, canChangeMember, companySetupInput, inviteInput, isRole, isSiteScoped,
  memberActiveInput, memberRefInput, memberUpdateInput, paths, validate,
  type Role, type UserProfile,
} from '@siteflow/shared';

// Temporary passwords: 12 characters, no look-alike letters, easy to read out over the phone
const tempPassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(randomBytes(12), (b) => chars[b % chars.length]).join('');
};
const roleName = (r: Role) => ROLE_LABELS[r].toLowerCase();

function parse<T extends Parameters<typeof validate>[0]>(schema: T, data: unknown) {
  const v = validate(schema, data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  return v.data;
}

// The signed-in user, who must be an active team manager (owner or admin)
async function teamActor(db: Firestore, req: CallableRequest) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const snap = await db.doc(paths.user(req.auth.uid)).get();
  const me = snap.data() as UserProfile | undefined;
  if (!me || me.active === false || !isRole(me.role) || !assignableRoles(me.role).length) {
    throw new HttpsError('permission-denied', 'Only owners and admins can manage the team.');
  }
  return { ...me, id: snap.id };
}

// A member of the actor's company that the actor is allowed to change
async function changeableMember(db: Firestore, actor: UserProfile & { id: string }, uid: string) {
  if (uid === actor.id) throw new HttpsError('failed-precondition', 'You cannot change your own access here. Use your account page.');
  const snap = await db.doc(paths.user(uid)).get();
  const m = snap.data() as UserProfile | undefined;
  if (!m || m.companyId !== actor.companyId) throw new HttpsError('not-found', 'That team member was not found.');
  if (!canChangeMember(actor.role, m.role, m.role)) {
    throw new HttpsError('permission-denied', m.role === 'owner' ? "The owner's access can't be changed." : `You can't change a ${roleName(m.role)}.`);
  }
  return { ...m, id: snap.id };
}

// Only sites that exist in this company, and only for roles limited to assigned sites
async function validSites(db: Firestore, cid: string, role: Role, siteIds: string[]) {
  if (!isSiteScoped(role)) return [];
  const valid: string[] = [];
  for (const sid of [...new Set(siteIds)]) if ((await db.doc(paths.site(cid, sid)).get()).exists) valid.push(sid);
  return valid;
}

async function logActivity(db: Firestore, actor: UserProfile & { id: string }, what: string) {
  await db.collection(paths.activity(actor.companyId)).add({ who: actor.name, whoId: actor.id, what, at: FieldValue.serverTimestamp() })
    .catch((e) => logger.warn('Activity log write failed', e));
}

// First sign-up. Creates the company and the owner's profile on the server, so plan and
// modules can't be chosen by the client. Safe to call again if the first attempt failed.
export const createCompany = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { companyName, name } = parse(companySetupInput, req.data);
  const uid = req.auth.uid;
  const db = getFirestore();
  // A login removed from a company may still hold a valid token for a while
  const login = await getAuth().getUser(uid).catch(() => null);
  if (!login || login.disabled) throw new HttpsError('permission-denied', 'This login is no longer active.');

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

// Owner or admin adds a team member. Returns a temporary password to share with them;
// they are asked to choose their own password when they first sign in.
export const inviteMember = onCall(async (req) => {
  const db = getFirestore();
  const me = await teamActor(db, req);
  const { name, email, phone, siteIds, ...rest } = parse(inviteInput, req.data);
  const role = rest.role as Role;
  if (!assignableRoles(me.role).includes(role)) throw new HttpsError('permission-denied', `You can't add someone as ${roleName(role)}.`);

  const sites = await validSites(db, me.companyId, role, siteIds);
  const password = tempPassword();
  let uid: string;
  try {
    uid = (await getAuth().createUser({ email, password, displayName: name })).uid;
  } catch (e: any) {
    if (e?.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'That email already has a SiteFlow account.');
    if (e?.code === 'auth/invalid-email') throw new HttpsError('invalid-argument', 'Enter a valid email.');
    logger.error('inviteMember: createUser failed', { code: e?.code });
    throw new HttpsError('internal', 'Could not create the account.');
  }
  try {
    await db.doc(paths.user(uid)).set({
      companyId: me.companyId, role, name, email, ...(phone ? { phone } : {}), siteIds: sites, active: true,
      mustChangePassword: true, createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    await getAuth().deleteUser(uid).catch(() => {}); // don't leave a login with no profile behind
    logger.error('inviteMember: profile write failed', e);
    throw new HttpsError('internal', 'Could not create the account.');
  }
  await logActivity(db, me, `added ${name} as ${roleName(role)}`);
  return { uid, tempPassword: password };
});

// Change a member's role and assigned sites
export const updateMember = onCall(async (req) => {
  const db = getFirestore();
  const me = await teamActor(db, req);
  const input = parse(memberUpdateInput, req.data);
  const role = input.role as Role;
  const m = await changeableMember(db, me, input.uid);
  if (!canChangeMember(me.role, m.role, role)) throw new HttpsError('permission-denied', `You can't make someone ${roleName(role)}.`);
  const siteIds = await validSites(db, me.companyId, role, input.siteIds);
  await db.doc(paths.user(m.id)).update({ role, siteIds, updatedAt: FieldValue.serverTimestamp() });
  if (role !== m.role) await logActivity(db, me, `changed ${m.name} from ${roleName(m.role)} to ${roleName(role)}`);
  if (isSiteScoped(role) && siteIds.join() !== [...(m.siteIds || [])].join()) await logActivity(db, me, `changed ${m.name}'s sites (${siteIds.length} now)`);
  return { role, siteIds };
});

// Switch a member off (they can't sign in or see anything) or back on
export const setMemberActive = onCall(async (req) => {
  const db = getFirestore();
  const me = await teamActor(db, req);
  const { uid, active } = parse(memberActiveInput, req.data);
  const m = await changeableMember(db, me, uid);
  await db.doc(paths.user(uid)).update({ active, updatedAt: FieldValue.serverTimestamp() });
  await getAuth().updateUser(uid, { disabled: !active });
  if (!active) await getAuth().revokeRefreshTokens(uid);
  await logActivity(db, me, `${active ? 'switched on' : 'switched off'} ${m.name}`);
  return { active };
});

// New temporary password for someone who forgot theirs (site teams often have no email access)
export const resetMemberPassword = onCall(async (req) => {
  const db = getFirestore();
  const me = await teamActor(db, req);
  const { uid } = parse(memberRefInput, req.data);
  const m = await changeableMember(db, me, uid);
  const password = tempPassword();
  await getAuth().updateUser(uid, { password });
  await getAuth().revokeRefreshTokens(uid); // signs them out everywhere
  await db.doc(paths.user(uid)).update({ mustChangePassword: true, updatedAt: FieldValue.serverTimestamp() });
  await logActivity(db, me, `issued a new temporary password for ${m.name}`);
  return { tempPassword: password };
});

// Remove someone from the company for good. Their reports and logs stay, with their name.
export const removeMember = onCall(async (req) => {
  const db = getFirestore();
  const me = await teamActor(db, req);
  const { uid } = parse(memberRefInput, req.data);
  const m = await changeableMember(db, me, uid);
  await db.doc(paths.user(uid)).delete();
  await getAuth().deleteUser(uid).catch((e) => {
    if (e?.code !== 'auth/user-not-found') throw e;
  });
  await logActivity(db, me, `removed ${m.name} (${roleName(m.role)})`);
  return { removed: true };
});
