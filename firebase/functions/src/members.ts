import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { isRole, paths, type UserProfile } from '@siteflow/shared';
import { checkLimit } from './limits';

// One login, several companies. users/{uid} is the person (name, email, phone, companyIds and the
// company they are looking at, companyId). companies/{cid}/members/{uid} is their role, projects,
// on/off switch and invitation in that company. Security rules read the membership for the company
// in the path, so each company's data stays separate.

const callOpts = { enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };
export type Membership = UserProfile & { id: string };

// Fields that belong to a membership, not to the person
const MEMBER_KEYS = ['role', 'siteIds', 'active', 'invitePending', 'inviteKind', 'inviteHash', 'inviteExpiresAt', 'joinedAt'] as const;

// Someone's membership in a company (by default the one they are looking at), with their name and email
export async function membershipOf(db: Firestore, uid: string, cid?: string): Promise<Membership | undefined> {
  const account = (await db.doc(paths.user(uid)).get()).data();
  const company = cid ?? account?.companyId;
  if (!company) return undefined;
  const m = (await db.doc(paths.member(company, uid)).get()).data();
  if (!m) return undefined;
  return { ...m, id: uid, companyId: company, name: m.name || account?.name || '', email: m.email || account?.email || '' } as Membership;
}

// The signed-in person in the company they are working in, who must be switched on with a known role
export async function actorOf(db: Firestore, uid: string | undefined): Promise<Membership> {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const me = await membershipOf(db, uid);
  if (!me || me.active === false || !isRole(me.role)) throw new HttpsError('permission-denied', 'You no longer have access to this company.');
  return me;
}

// Adds a company to a person's list and makes it the one they look at if they have none
export async function joinCompany(db: Firestore, uid: string, cid: string, person: { name: string; email: string; phone?: string }) {
  const ref = db.doc(paths.user(uid));
  await db.runTransaction(async (t) => {
    const a = (await t.get(ref)).data();
    if (!a) {
      t.set(ref, { name: person.name, email: person.email, ...(person.phone ? { phone: person.phone } : {}), companyIds: [cid], companyId: cid, createdAt: FieldValue.serverTimestamp() });
    } else {
      t.update(ref, { companyIds: FieldValue.arrayUnion(cid), ...(a.companyId ? {} : { companyId: cid }), updatedAt: FieldValue.serverTimestamp() });
    }
  });
}

// Takes a company off a person's list. Returns the companies they still belong to.
export async function leaveCompany(db: Firestore, uid: string, cid: string): Promise<string[]> {
  const ref = db.doc(paths.user(uid));
  return db.runTransaction(async (t) => {
    const a = (await t.get(ref)).data();
    t.delete(db.doc(paths.member(cid, uid)));
    if (!a) return [];
    const left = ((a.companyIds || []) as string[]).filter((x) => x !== cid);
    t.update(ref, {
      companyIds: left, companyId: a.companyId === cid ? (left[0] ?? FieldValue.delete()) : a.companyId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return left;
  });
}

// Moves accounts made before memberships (role and projects on users/{uid}) to the new layout.
// Moves everyone in the caller's company at once, so the team list is complete for whoever signs
// in first. Safe to call again.
export async function migrateCompany(db: Firestore, cid: string) {
  const snap = await db.collection(paths.users()).where('companyId', '==', cid).get();
  let moved = 0;
  for (const d of snap.docs) {
    const u = d.data();
    if (!('role' in u)) continue; // already moved
    const batch = db.batch();
    const member: Record<string, unknown> = { name: u.name || '', email: u.email || '', ...(u.phone ? { phone: u.phone } : {}), createdAt: u.createdAt ?? FieldValue.serverTimestamp() };
    for (const k of MEMBER_KEYS) if (k in u) member[k] = u[k];
    member.siteIds = u.siteIds || [];
    batch.set(db.doc(paths.member(cid, d.id)), member, { merge: true });
    const clear: Record<string, unknown> = Object.fromEntries(MEMBER_KEYS.map((k) => [k, FieldValue.delete()]));
    batch.update(d.ref, { ...clear, companyIds: FieldValue.arrayUnion(cid), updatedAt: FieldValue.serverTimestamp() });
    await batch.commit();
    moved++;
  }
  return moved;
}

// Called by the apps when a signed-in person's record still has the old layout
export const migrateAccount = onCall(callOpts, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const db = getFirestore();
  await checkLimit(req.auth.uid, 'migrate');
  const u = (await db.doc(paths.user(req.auth.uid)).get()).data();
  if (!u?.companyId || !('role' in u)) return { moved: 0 };
  const moved = await migrateCompany(db, u.companyId);
  logger.info('Moved accounts to memberships', { cid: u.companyId, moved });
  return { moved };
});

// A person changed their name or phone: copy it to each company they belong to, so team lists,
// reports and the security rules (which check report authors' names) all use the new one
export const onAccountChanged = onDocumentUpdated('users/{uid}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after || (before?.name === after.name && (before?.phone ?? '') === (after.phone ?? ''))) return;
  const db = getFirestore();
  const uid = event.params.uid;
  for (const cid of (after.companyIds || []) as string[]) {
    const ref = db.doc(paths.member(cid, uid));
    await ref.update({ name: after.name, phone: after.phone ? after.phone : FieldValue.delete() }).catch((e) => {
      if (e?.code !== 5) logger.warn('Could not copy profile to membership', { cid, uid, error: String(e) }); // 5: not found
    });
  }
  if (before?.name !== after.name) await getAuth().updateUser(uid, { displayName: after.name }).catch(() => {});
});
