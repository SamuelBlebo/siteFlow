import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { checkLimit } from './limits';

// Set ENFORCE_APP_CHECK=true in firebase/functions/.env.<project> once the web app has App Check
// (docs/OPERATIONS.md). The mobile app doesn't call these functions.
const callOpts = { enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };
import {
  DEFAULT_MODULES, MODULES, ROLE_LABELS, applyModuleSwitch, moduleSwitchInput, planFor, assignableRoles, canChangeMember, companySetupInput, inviteInput, isRole, isSiteScoped,
  can, memberActiveInput, memberRefInput, memberUpdateInput, paths, siteAssignInput, validate,
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
export const createCompany = onCall(callOpts, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { companyName, name } = parse(companySetupInput, req.data);
  const uid = req.auth.uid;
  await checkLimit(uid, 'createCompany');
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
export const inviteMember = onCall(callOpts, async (req) => {
  const db = getFirestore();
  const me = await teamActor(db, req);
  await checkLimit(me.id, 'invite');
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
export const updateMember = onCall(callOpts, async (req) => {
  const db = getFirestore();
  const me = await teamActor(db, req);
  await checkLimit(me.id, 'teamChange');
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
export const setMemberActive = onCall(callOpts, async (req) => {
  const db = getFirestore();
  const me = await teamActor(db, req);
  await checkLimit(me.id, 'teamChange');
  const { uid, active } = parse(memberActiveInput, req.data);
  const m = await changeableMember(db, me, uid);
  await db.doc(paths.user(uid)).update({ active, updatedAt: FieldValue.serverTimestamp() });
  await getAuth().updateUser(uid, { disabled: !active });
  if (!active) await getAuth().revokeRefreshTokens(uid);
  await logActivity(db, me, `${active ? 'switched on' : 'switched off'} ${m.name}`);
  return { active };
});

// New temporary password for someone who forgot theirs (site teams often have no email access)
export const resetMemberPassword = onCall(callOpts, async (req) => {
  const db = getFirestore();
  const me = await teamActor(db, req);
  await checkLimit(me.id, 'resetPassword');
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
export const removeMember = onCall(callOpts, async (req) => {
  const db = getFirestore();
  const me = await teamActor(db, req);
  await checkLimit(me.id, 'teamChange');
  const { uid } = parse(memberRefInput, req.data);
  const m = await changeableMember(db, me, uid);
  await db.doc(paths.user(uid)).delete();
  await getAuth().deleteUser(uid).catch((e) => {
    if (e?.code !== 'auth/user-not-found') throw e;
  });
  await logActivity(db, me, `removed ${m.name} (${roleName(m.role)})`);
  return { removed: true };
});

// Put a supervisor or viewer on a site, or take them off. Project managers can do this
// for any site (they manage sites but not the team); owners and admins too.
export const assignToSite = onCall(callOpts, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const db = getFirestore();
  const { sid, uid, assigned } = parse(siteAssignInput, req.data);
  const meSnap = await db.doc(paths.user(req.auth.uid)).get();
  const me = meSnap.data() as UserProfile | undefined;
  if (!me || me.active === false || !isRole(me.role) || !can(me.role, 'sites.manage')) {
    throw new HttpsError('permission-denied', 'Only owners, admins and project managers can assign people to sites.');
  }
  await checkLimit(req.auth.uid, 'teamChange');
  const site = await db.doc(paths.site(me.companyId, sid)).get();
  if (!site.exists) throw new HttpsError('not-found', 'That site was not found.');
  const mSnap = await db.doc(paths.user(uid)).get();
  const m = mSnap.data() as UserProfile | undefined;
  if (!m || m.companyId !== me.companyId) throw new HttpsError('not-found', 'That team member was not found.');
  if (!isSiteScoped(m.role)) throw new HttpsError('failed-precondition', `${m.name} already sees every site.`);
  await db.doc(paths.user(uid)).update({ siteIds: assigned ? FieldValue.arrayUnion(sid) : FieldValue.arrayRemove(sid), updatedAt: FieldValue.serverTimestamp() });
  await logActivity(db, { ...me, id: meSnap.id }, `${assigned ? 'added' : 'removed'} ${m.name} ${assigned ? 'to' : 'from'} ${site.data()?.name}`);
  return { assigned };
});

// Owner switches a module on or off from the Modules page. Plan and modules stay server-written
// (the rules refuse them from apps); switching a module off keeps its data.
export const setModule = onCall(callOpts, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { key, on } = parse(moduleSwitchInput, req.data);
  const db = getFirestore();
  const snap = await db.doc(paths.user(req.auth.uid)).get();
  const me = snap.data() as UserProfile | undefined;
  if (!me || me.active === false || !isRole(me.role) || !can(me.role, 'company.settings')) {
    throw new HttpsError('permission-denied', 'Only the owner can change modules.');
  }
  await checkLimit(req.auth.uid, 'settings');
  const ref = db.doc(paths.company(me.companyId));
  const result = await db.runTransaction(async (t) => {
    const company = (await t.get(ref)).data();
    if (!company) throw new HttpsError('not-found', 'Company not found.');
    const modules = applyModuleSwitch(company.modules || {}, key, on);
    if (!modules) throw new HttpsError('failed-precondition', 'That module cannot be switched yet.');
    const plan = planFor(modules);
    t.update(ref, { modules, plan, updatedAt: FieldValue.serverTimestamp() });
    return { modules, plan };
  });
  const name = MODULES.find((m) => m.key === key)?.name ?? key;
  await logActivity(db, { ...me, id: snap.id }, `switched ${on ? 'on' : 'off'} ${name}`);
  return result;
});
