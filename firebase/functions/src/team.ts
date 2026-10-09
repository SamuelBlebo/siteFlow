import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { checkLimit } from './limits';
import { EMAIL_KEY, sendEmail } from './notify';
import { dropInvite, issueInvite } from './invites';
import { actorOf, joinCompany, leaveCompany, membershipOf, migrateCompany, type Membership } from './members';

// Set ENFORCE_APP_CHECK=true in firebase/functions/.env.<project> once the web app has App Check
// (docs/OPERATIONS.md). The mobile app doesn't call these functions.
const callOpts = { enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };
const APP_URL = process.env.APP_URL ?? 'https://siteflow.app';
import {
  DEFAULT_MODULES, MODULES, countryOf, ROLE_LABELS, applyModuleSwitch, moduleSwitchInput, planFor, assignableRoles, canChangeMember, companySetupInput, inviteInput, isSiteScoped,
  can, memberActiveInput, memberRefInput, memberUpdateInput, paths, siteAssignInput, validate,
  type Company, type Role,
} from '@siteflow/shared';

const roleName = (r: Role) => ROLE_LABELS[r].toLowerCase();

function parse<T extends Parameters<typeof validate>[0]>(schema: T, data: unknown) {
  const v = validate(schema, data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  return v.data;
}

// The signed-in user, who must be an active team manager (owner or admin) in the company they are working in
async function teamActor(db: Firestore, req: CallableRequest) {
  const me = await actorOf(db, req.auth?.uid);
  if (!assignableRoles(me.role).length) throw new HttpsError('permission-denied', 'Only owners and admins can manage the team.');
  return me;
}

// A member of the actor's company that the actor is allowed to change
async function changeableMember(db: Firestore, actor: Membership, uid: string) {
  if (uid === actor.id) throw new HttpsError('failed-precondition', 'You cannot change your own access here. Use your account page.');
  const m = await membershipOf(db, uid, actor.companyId);
  if (!m) throw new HttpsError('not-found', 'That team member was not found.');
  if (!canChangeMember(actor.role, m.role, m.role)) {
    throw new HttpsError('permission-denied', m.role === 'owner' ? "The owner's access can't be changed." : `You can't change a ${roleName(m.role)}.`);
  }
  return m;
}

// The other companies someone belongs to (one login can be in several)
async function otherCompanies(db: Firestore, uid: string, cid: string) {
  const ids = ((await db.doc(paths.user(uid)).get()).data()?.companyIds || []) as string[];
  return ids.filter((x) => x !== cid);
}

// Only sites that exist in this company, and only for roles limited to assigned sites
async function validSites(db: Firestore, cid: string, role: Role, siteIds: string[]) {
  if (!isSiteScoped(role)) return [];
  const valid: string[] = [];
  for (const sid of [...new Set(siteIds)]) if ((await db.doc(paths.site(cid, sid)).get()).exists) valid.push(sid);
  return valid;
}

async function logActivity(db: Firestore, actor: Membership, what: string) {
  await db.collection(paths.activity(actor.companyId)).add({ who: actor.name, whoId: actor.id, what, at: FieldValue.serverTimestamp() })
    .catch((e) => logger.warn('Activity log write failed', e));
}

// First sign-up, or someone already in another company starting their own. Creates the company and
// the owner's membership on the server, so plan and modules can't be chosen by the client. Safe to
// call again if the first attempt failed.
export const createCompany = onCall(callOpts, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { companyName, name, country } = parse(companySetupInput, req.data);
  const where = countryOf(country); // currency and time zone follow the country; the owner can change them later
  const uid = req.auth.uid;
  await checkLimit(uid, 'createCompany');
  const db = getFirestore();
  // A login removed from a company may still hold a valid token for a while
  const login = await getAuth().getUser(uid).catch(() => null);
  if (!login || login.disabled) throw new HttpsError('permission-denied', 'This login is no longer active.');

  const userRef = db.doc(paths.user(uid));
  const companyRef = db.doc(paths.company(uid)); // an owner's company id is their uid
  const before = (await userRef.get()).data();
  if (before && 'role' in before && before.companyId) await migrateCompany(db, before.companyId); // older layout: move it first
  await db.runTransaction(async (t) => {
    const existing = await t.get(companyRef);
    if (existing.exists) {
      if (existing.data()?.ownerId === uid) return; // already set up
      throw new HttpsError('already-exists', 'This account already has a company.');
    }
    const account = await t.get(userRef);
    const email = req.auth?.token.email ?? '';
    t.set(companyRef, {
      name: companyName, ownerId: uid, plan: 'starter', modules: DEFAULT_MODULES,
      country: where.code, currency: where.currency, timeZone: where.timeZone, createdAt: FieldValue.serverTimestamp(),
    });
    const person = account.data();
    t.set(db.doc(paths.member(uid, uid)), {
      role: 'owner', name: person?.name || name, email: person?.email || email, ...(person?.phone ? { phone: person.phone } : {}),
      siteIds: [], active: true, createdAt: FieldValue.serverTimestamp(),
    });
    if (!account.exists) t.set(userRef, { name, email, companyIds: [uid], companyId: uid, createdAt: FieldValue.serverTimestamp() });
    else t.update(userRef, { companyIds: FieldValue.arrayUnion(uid), companyId: uid, updatedAt: FieldValue.serverTimestamp() });
  });
  return { companyId: uid };
});

// Owner or admin adds a team member. Someone new gets a login and an invitation link to set their
// password. Someone who already uses SiteFlow (with another company) keeps their login: they are
// added straight away and told by email, and see this company in their company switcher.
export const inviteMember = onCall({ ...callOpts, secrets: [EMAIL_KEY] }, async (req) => {
  const db = getFirestore();
  const me = await teamActor(db, req);
  await checkLimit(me.id, 'invite');
  const { name, email, phone, siteIds, ...rest } = parse(inviteInput, req.data);
  const role = rest.role as Role;
  if (!assignableRoles(me.role).includes(role)) throw new HttpsError('permission-denied', `You can't add someone as ${roleName(role)}.`);
  const cid = me.companyId;
  const sites = await validSites(db, cid, role, siteIds);

  const login = await getAuth().getUserByEmail(email).catch((e) => {
    if (e?.code === 'auth/user-not-found') return null;
    if (e?.code === 'auth/invalid-email') throw new HttpsError('invalid-argument', 'Enter a valid email.');
    throw e;
  });
  if (login) return addExisting(db, me, login.uid, { name, email, phone, role, sites, disabled: !!login.disabled });

  // A strong random password nobody sees: the person sets their own from the invitation link
  let uid: string;
  try {
    uid = (await getAuth().createUser({ email, password: randomBytes(24).toString('base64url'), displayName: name })).uid;
  } catch (e: any) {
    if (e?.code === 'auth/email-already-exists') throw new HttpsError('aborted', 'That email was just added by someone else. Refresh the team list.');
    if (e?.code === 'auth/invalid-email') throw new HttpsError('invalid-argument', 'Enter a valid email.');
    logger.error('inviteMember: createUser failed', { code: e?.code });
    throw new HttpsError('internal', 'Could not create the account.');
  }
  const member = { role, name, email, ...(phone ? { phone } : {}), siteIds: sites, active: true };
  try {
    await db.doc(paths.member(cid, uid)).set({ ...member, invitePending: true, createdAt: FieldValue.serverTimestamp() });
    await joinCompany(db, uid, cid, { name, email, phone });
  } catch (e) {
    await db.doc(paths.member(cid, uid)).delete().catch(() => {});
    await getAuth().deleteUser(uid).catch(() => {}); // don't leave a login with no profile behind
    logger.error('inviteMember: profile write failed', e);
    throw new HttpsError('internal', 'Could not create the account.');
  }
  await logActivity(db, me, `invited ${name} as ${roleName(role)}`);
  const issued = await issueInvite(db, { ...member, id: uid, companyId: cid }, me, 'invite');
  return { uid, ...issued };
});

// Someone with a SiteFlow login joins one more company. No link or password: they sign in as usual.
async function addExisting(db: Firestore, me: Membership, uid: string, p: { name: string; email: string; phone?: string; role: Role; sites: string[]; disabled: boolean }) {
  const cid = me.companyId;
  const ref = db.doc(paths.member(cid, uid));
  const account = (await db.doc(paths.user(uid)).get()).data();
  if (account && 'role' in account && account.companyId) await migrateCompany(db, account.companyId); // older layout: move it first
  const name = account?.name || p.name; // their own name, as they set it
  const created = await db.runTransaction(async (t) => {
    if ((await t.get(ref)).exists) return false;
    t.set(ref, {
      role: p.role, name, email: p.email, ...(account?.phone || p.phone ? { phone: account?.phone || p.phone } : {}), siteIds: p.sites, active: true,
      invitePending: false, joinedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!created) throw new HttpsError('already-exists', `${name} is already in your team.`);
  await joinCompany(db, uid, cid, { name, email: p.email, phone: p.phone });
  if (p.disabled) await getAuth().updateUser(uid, { disabled: false }); // switched off everywhere before; switches stay per company
  await logActivity(db, me, `added ${name} as ${roleName(p.role)} (already on SiteFlow)`);

  const company = (await db.doc(paths.company(cid)).get()).data() as Company | undefined;
  const companyName = company?.name || 'their company';
  const text = `Hi ${name.split(' ')[0]},\n\n${me.name} has added you to ${companyName} on SiteFlow as ${roleName(p.role)}.\n\nSign in as usual with ${p.email}:\n${APP_URL}/login\n\nThen choose ${companyName} from the company list at the top of the menu. Your other companies are still there.\n\nSiteFlow, construction project management`;
  const res = await sendEmail(p.email, `${me.name} added you to ${companyName} on SiteFlow`, text)
    .catch((e) => { logger.warn('Added-to-company email failed', { error: String(e) }); return { status: 'failed' as const }; });
  return { uid, existing: true, email: res.status };
}

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
  await db.doc(paths.member(me.companyId, m.id)).update({ role, siteIds, updatedAt: FieldValue.serverTimestamp() });
  if (role !== m.role) await logActivity(db, me, `changed ${m.name} from ${roleName(m.role)} to ${roleName(role)}`);
  if (isSiteScoped(role) && siteIds.join() !== [...(m.siteIds || [])].join()) await logActivity(db, me, `changed ${m.name}'s sites (${siteIds.length} now)`);
  return { role, siteIds };
});

// Switch a member off in this company (they can't see anything here) or back on. Their login is only
// locked when they have no other company that still has them switched on.
export const setMemberActive = onCall(callOpts, async (req) => {
  const db = getFirestore();
  const me = await teamActor(db, req);
  await checkLimit(me.id, 'teamChange');
  const { uid, active } = parse(memberActiveInput, req.data);
  const m = await changeableMember(db, me, uid);
  await db.doc(paths.member(me.companyId, uid)).update({ active, updatedAt: FieldValue.serverTimestamp() });
  let elsewhere = false;
  for (const cid of await otherCompanies(db, uid, me.companyId)) {
    if ((await db.doc(paths.member(cid, uid)).get()).data()?.active !== false) { elsewhere = true; break; }
  }
  if (!elsewhere) {
    await getAuth().updateUser(uid, { disabled: !active });
    if (!active) await getAuth().revokeRefreshTokens(uid);
  }
  await logActivity(db, me, `${active ? 'switched on' : 'switched off'} ${m.name}`);
  return { active };
});

// New temporary password for someone who forgot theirs (site teams often have no email access)
export const resetMemberPassword = onCall({ ...callOpts, secrets: [EMAIL_KEY] }, async (req) => {
  const db = getFirestore();
  const me = await teamActor(db, req);
  await checkLimit(me.id, 'resetPassword');
  const { uid } = parse(memberRefInput, req.data);
  const m = await changeableMember(db, me, uid);
  // A login shared with other companies is the person's own: a manager here must not be able to set it
  if ((await otherCompanies(db, uid, me.companyId)).length) {
    throw new HttpsError('failed-precondition', `${m.name.split(' ')[0]} also uses SiteFlow with another company, so only they can change their password. Ask them to use “Forgot password?” on the sign-in page.`);
  }
  // Someone who never accepted their invitation gets a fresh invitation; everyone else a password link
  const kind = m.invitePending && m.inviteKind !== 'reset' ? 'invite' : 'reset';
  const issued = await issueInvite(db, m, me, kind);
  await logActivity(db, me, kind === 'invite' ? `sent ${m.name} a new invitation link` : `sent ${m.name} a link to set a new password`);
  return issued;
});

// Remove someone from this company. Their reports and logs stay, with their name. Their login is
// deleted only when they belong to no other company.
export const removeMember = onCall(callOpts, async (req) => {
  const db = getFirestore();
  const me = await teamActor(db, req);
  await checkLimit(me.id, 'teamChange');
  const { uid } = parse(memberRefInput, req.data);
  const m = await changeableMember(db, me, uid);
  await dropInvite(db, me.companyId, uid); // an open invitation link stops working
  const left = await leaveCompany(db, uid, me.companyId);
  if (!left.length) {
    await db.doc(paths.user(uid)).delete();
    await getAuth().deleteUser(uid).catch((e) => {
      if (e?.code !== 'auth/user-not-found') throw e;
    });
  }
  await logActivity(db, me, `removed ${m.name} (${roleName(m.role)})`);
  return { removed: true };
});

// Put a supervisor or viewer on a site, or take them off. Project managers can do this
// for any site (they manage sites but not the team); owners and admins too.
export const assignToSite = onCall(callOpts, async (req) => {
  const db = getFirestore();
  const { sid, uid, assigned } = parse(siteAssignInput, req.data);
  const me = await actorOf(db, req.auth?.uid);
  if (!can(me.role, 'sites.manage')) {
    throw new HttpsError('permission-denied', 'Only owners, admins and project managers can assign people to sites.');
  }
  await checkLimit(me.id, 'teamChange');
  const site = await db.doc(paths.site(me.companyId, sid)).get();
  if (!site.exists) throw new HttpsError('not-found', 'That site was not found.');
  const m = await membershipOf(db, uid, me.companyId);
  if (!m) throw new HttpsError('not-found', 'That team member was not found.');
  if (!isSiteScoped(m.role)) throw new HttpsError('failed-precondition', `${m.name} already sees every site.`);
  await db.doc(paths.member(me.companyId, uid)).update({ siteIds: assigned ? FieldValue.arrayUnion(sid) : FieldValue.arrayRemove(sid), updatedAt: FieldValue.serverTimestamp() });
  await logActivity(db, me, `${assigned ? 'added' : 'removed'} ${m.name} ${assigned ? 'to' : 'from'} ${site.data()?.name}`);
  return { assigned };
});

// Owner switches a module on or off from the Modules page. Plan and modules stay server-written
// (the rules refuse them from apps); switching a module off keeps its data.
export const setModule = onCall(callOpts, async (req) => {
  const { key, on } = parse(moduleSwitchInput, req.data);
  const db = getFirestore();
  const me = await actorOf(db, req.auth?.uid);
  if (!can(me.role, 'company.settings')) throw new HttpsError('permission-denied', 'Only the owner can change modules.');
  await checkLimit(me.id, 'settings');
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
  await logActivity(db, me, `switched ${on ? 'on' : 'off'} ${name}`);
  return result;
});
