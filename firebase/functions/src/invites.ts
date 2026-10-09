import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { createHash, randomBytes } from 'node:crypto';
import {
  INVITE_DAYS, ROLE_LABELS, acceptInviteInput, companyLocale, inviteTokenInput, paths, todayKey, validate,
  type Company, type Role, type UserProfile,
} from '@siteflow/shared';
import { EMAIL_KEY, sendEmail } from './notify';

// Invitation links. A new team member (or someone who needs a new password) gets a one-time link,
// valid for INVITE_DAYS, to set their own password. Only a hash of the token is stored, in
// invites/{hash}, which no app can read (no security rule opens it). A newer link replaces the older one.

const callOpts = { enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };
const APP_URL = process.env.APP_URL ?? 'https://siteflow.app';
const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');
const invitesCol = (db: Firestore) => db.collection('invites');

function parse<T extends Parameters<typeof validate>[0]>(schema: T, data: unknown) {
  const v = validate(schema, data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  return v.data;
}

export type InviteKind = 'invite' | 'reset';
export interface IssuedInvite { link: string; expiresAt: string; email: 'sent' | 'failed' | 'skipped' }

// Makes a fresh link for a member, replaces any earlier one, and emails it
export async function issueInvite(db: Firestore, member: UserProfile & { id: string }, by: { name: string }, kind: InviteKind): Promise<IssuedInvite> {
  const token = randomBytes(32).toString('base64url');
  const hash = hashOf(token);
  const expires = Timestamp.fromMillis(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  const userRef = db.doc(paths.user(member.id));
  const before = (await userRef.get()).data() as (UserProfile & { inviteHash?: string }) | undefined;
  const batch = db.batch();
  if (before?.inviteHash) batch.delete(invitesCol(db).doc(before.inviteHash));
  batch.set(invitesCol(db).doc(hash), {
    uid: member.id, companyId: member.companyId, email: member.email, name: member.name, role: member.role, kind,
    createdBy: by.name, createdAt: FieldValue.serverTimestamp(), expiresAt: expires,
  });
  batch.update(userRef, { invitePending: true, inviteKind: kind, inviteHash: hash, inviteExpiresAt: expires, mustChangePassword: false, updatedAt: FieldValue.serverTimestamp() });
  await batch.commit();

  const link = `${APP_URL}/invite/${token}`;
  const company = (await db.doc(paths.company(member.companyId)).get()).data() as Company | undefined;
  const loc = companyLocale(company);
  const until = new Date(`${todayKey(expires.toDate(), loc.timeZone)}T00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const first = member.name.split(' ')[0];
  const text = kind === 'invite'
    ? `Hi ${first},\n\n${by.name} has added you to ${company?.name || 'their company'} on SiteFlow as ${ROLE_LABELS[member.role as Role].toLowerCase()}.\n\nSet your password and sign in here:\n${link}\n\nThe link works once and expires on ${until}. You sign in with this email address: ${member.email}\n\nSiteFlow, construction project management`
    : `Hi ${first},\n\n${by.name} has sent you a link to set a new SiteFlow password for ${company?.name || 'your company'}.\n\nSet your password here:\n${link}\n\nThe link works once and expires on ${until}. If you didn't expect this, ask your manager.\n\nSiteFlow`;
  const subject = kind === 'invite' ? `${by.name} invited you to ${company?.name || 'SiteFlow'} on SiteFlow` : 'Set a new SiteFlow password';
  const res = await sendEmail(member.email, subject, text).catch((e) => { logger.warn('Invite email failed', { error: String(e) }); return { status: 'failed' as const }; });
  return { link, expiresAt: expires.toDate().toISOString(), email: res.status };
}

// What the invitation page shows before the person sets a password. Anyone with the link may ask.
export const inviteInfo = onCall(callOpts, async (req) => {
  const { token } = parse(inviteTokenInput, req.data);
  const db = getFirestore();
  const snap = await invitesCol(db).doc(hashOf(token)).get();
  if (!snap.exists) throw new HttpsError('not-found', 'This link has already been used or was replaced by a newer one. Ask for a new invitation.');
  const inv = snap.data()!;
  const company = (await db.doc(paths.company(inv.companyId)).get()).data();
  return {
    kind: inv.kind, name: inv.name, email: inv.email, role: ROLE_LABELS[inv.role as Role] ?? inv.role, companyName: company?.name ?? '',
    invitedBy: inv.createdBy, expired: (inv.expiresAt as Timestamp).toMillis() < Date.now(),
  };
});

// The person sets their password from the link. The link then stops working.
export const acceptInvite = onCall(callOpts, async (req) => {
  const { token, password } = parse(acceptInviteInput, req.data);
  const db = getFirestore();
  const hash = hashOf(token);
  const ref = invitesCol(db).doc(hash);
  const result = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'This link has already been used or was replaced by a newer one. Ask for a new invitation.');
    const inv = snap.data()!;
    if ((inv.expiresAt as Timestamp).toMillis() < Date.now()) throw new HttpsError('deadline-exceeded', 'This link has expired. Ask your manager to send a new one.');
    const userRef = db.doc(paths.user(inv.uid));
    const profile = (await t.get(userRef)).data() as (UserProfile & { inviteHash?: string }) | undefined;
    if (!profile || profile.inviteHash !== hash) throw new HttpsError('not-found', 'This link was replaced by a newer one. Use the latest invitation.');
    if (profile.active === false) throw new HttpsError('permission-denied', 'Your access has been switched off. Ask your manager.');
    t.delete(ref);
    t.update(userRef, {
      invitePending: false, inviteHash: FieldValue.delete(), inviteExpiresAt: FieldValue.delete(), mustChangePassword: false,
      ...(inv.kind === 'invite' && !profile.joinedAt ? { joinedAt: FieldValue.serverTimestamp() } : {}), updatedAt: FieldValue.serverTimestamp(),
    });
    return { uid: inv.uid as string, email: inv.email as string, kind: inv.kind as InviteKind, name: inv.name as string, companyId: inv.companyId as string };
  });
  await getAuth().updateUser(result.uid, { password, emailVerified: true });
  if (result.kind === 'reset') await getAuth().revokeRefreshTokens(result.uid); // other devices sign in again
  await db.collection(paths.activity(result.companyId)).add({
    who: result.name, whoId: result.uid, what: result.kind === 'invite' ? 'accepted their invitation' : 'set a new password from a link', at: FieldValue.serverTimestamp(),
  }).catch(() => {});
  return { email: result.email };
});

// Removes a member's open invitation (when they are removed from the company)
export async function dropInvite(db: Firestore, uid: string) {
  const p = (await db.doc(paths.user(uid)).get()).data() as { inviteHash?: string } | undefined;
  if (p?.inviteHash) await invitesCol(db).doc(p.inviteHash).delete().catch(() => {});
}
