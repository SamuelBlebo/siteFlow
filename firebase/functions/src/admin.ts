import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { checkLimit } from './limits';
import { EMAIL_KEY, sendEmail } from './notify';
import { issueInvite, type IssuedInvite } from './invites';
import {
  ADMIN_FIELDS, adminCompanyFlagInput, adminCompanyInput, adminDisableInput, adminInviteInput, adminUserActionInput, adminFindUserInput, companyLocale, companyStatus, gettingStartedSteps, paths, todayKey, validate,
  type CompanyStatus, type StepKey,
} from '@siteflow/shared';

// The platform admin (the person who runs SiteFlow, not a client's owner). Only logins with the
// platformAdmin claim get in; the claim is set from the command line (scripts/set-platform-admin.mjs).
// Counts and activity only: the server may read client data to work out a yes/no or a date, but every
// answer goes through pick() with its ADMIN_FIELDS list, so no report, issue, finance or activity text leaves.
const callOpts = { enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };
const DAY = 86_400_000;
const APP_URL = process.env.APP_URL ?? 'https://siteflow.app';

export type CompanyRow = {
  id: string; name: string; country: string; ownerName: string; ownerEmail: string; createdAt: string | null;
  people: number; projects: number; sampleOnly: boolean; reports7d: number; lastActive: string | null;
  status: CompanyStatus; suspended: boolean; internal: boolean;
};
export type AdminPerson = { id: string; name: string; email: string; role: string; lastActive: string | null; disabled: boolean; invitePending: boolean };
export type AdminProject = { id: string; name: string; status: string; lastReportDate: string | null; sample: boolean };
export type CompanyDetail = CompanyRow & { members: AdminPerson[]; projectList: AdminProject[]; steps: { key: StepKey; title: string; done: boolean }[] };
export type AdminUser = {
  id: string; email: string; name: string; disabled: boolean; createdAt: string | null; lastActive: string | null;
  companies: { id: string; name: string; role: string }[];
};
export type Overview = {
  companies: number; people: number; newCompanies7: number; newCompanies30: number; newPeople7: number; newPeople30: number;
  activeCompanies7: number; activePeople7: number; signupsByWeek: { week: string; companies: number; people: number }[];
};
export type LogEntry = { id: string; who: string; action: string; target: string; at: string | null };

// The signed-in platform admin. Checked on every call, so removing the claim takes effect at the next token refresh.
export async function requireAdmin(req: CallableRequest) {
  if (req.auth?.token.platformAdmin !== true) throw new HttpsError('permission-denied', 'You no longer have admin access.');
  const uid = req.auth.uid;
  await checkLimit(uid, 'admin');
  return { uid, name: String(req.auth.token.name || req.auth.token.email || 'SiteFlow admin') };
}

// Only the listed keys, so a field added to a row by mistake never reaches the browser
export function pick<T>(obj: object, keys: readonly string[]): T {
  return Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, (obj as Record<string, unknown>)[k]])) as T;
}

// When someone last used SiteFlow: lastRefreshTime moves while they keep the app open, lastSignInTime only on sign-in
export function lastActiveOf(u: UserRecord): number | null {
  const t = u.metadata.lastRefreshTime ?? u.metadata.lastSignInTime;
  const n = t ? Date.parse(t) : NaN;
  return Number.isNaN(n) ? null : n;
}

function parse<T extends Parameters<typeof validate>[0]>(schema: T, data: unknown) {
  const v = validate(schema, data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  return v.data;
}

// Firestore Timestamp, Date or date string as milliseconds; null when missing
function ms(v: unknown): number | null {
  if (!v) return null;
  if (typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  const n = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isNaN(n) ? null : n;
}
const iso = (n: number | null) => (n === null ? null : new Date(n).toISOString());
const newest = (...xs: (number | null)[]) => xs.reduce<number | null>((a, b) => (b !== null && (a === null || b > a) ? b : a), null);

// Every login, a page of 1000 at a time
async function allUsers() {
  const users: UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

// Just the logins of these people (getUsers takes 100 at a time)
async function usersById(ids: string[]) {
  const found = new Map<string, UserRecord>();
  for (let i = 0; i < ids.length; i += 100) {
    const r = await getAuth().getUsers(ids.slice(i, i + 100).map((uid) => ({ uid })));
    for (const u of r.users) found.set(u.uid, u);
  }
  return found;
}

// What we know about one company, worked out from dates and counts. Report and activity
// lookups ask for their date fields alone (select), so their text never reaches the function.
async function companyFacts(db: Firestore, doc: DocumentSnapshot, logins: Map<string, UserRecord>, now: number) {
  const cid = doc.id;
  const c = doc.data() ?? {};
  const reports = db.collectionGroup('reports').where('companyId', '==', cid);
  const weekAgo = todayKey(new Date(now - 6 * DAY), companyLocale(c).timeZone);
  const [members, sites, lastReport, lastEntry, recent] = await Promise.all([
    db.collection(paths.members(cid)).select('name', 'email', 'role', 'invitePending').get(),
    db.collection(paths.sites(cid)).select('name', 'status', 'lastReportDate', 'sample').get(),
    reports.orderBy('date', 'desc').limit(1).select('date', 'createdAt').get(),
    db.collection(paths.activity(cid)).orderBy('at', 'desc').limit(1).select('at').get(),
    reports.where('date', '>=', weekAgo).orderBy('date', 'desc').count().get(), // same order as the companyId + date index
  ]);
  const real = sites.docs.filter((s) => !s.data().sample);
  const report = lastReport.docs[0]?.data();
  const lastActive = newest(
    ...members.docs.map((m) => { const u = logins.get(m.id); return u ? lastActiveOf(u) : null; }),
    report ? ms(report.createdAt) ?? ms(`${report.date}T00:00:00Z`) : null,
    ms(lastEntry.docs[0]?.data().at),
  );
  const owner = members.docs.find((m) => m.id === c.ownerId)?.data();
  const ownerLogin = logins.get(c.ownerId);
  const createdAt = ms(c.createdAt);
  const row: CompanyRow = {
    id: cid, name: c.name || '', country: companyLocale(c).country,
    ownerName: owner?.name || ownerLogin?.displayName || '', ownerEmail: owner?.email || ownerLogin?.email || '',
    createdAt: iso(createdAt), people: members.size, projects: real.length, sampleOnly: sites.size > 0 && real.length === 0,
    reports7d: recent.data().count, lastActive: iso(lastActive), status: companyStatus({ realProjects: real.length, lastActive }, now),
    suspended: !!c.suspended, internal: !!c.internal,
  };
  return { row, createdAt, company: c, members, sites, real };
}

const toRow = (r: CompanyRow) => pick<CompanyRow>(r, ADMIN_FIELDS.companyRow);
// Newest sign-ups first; companies from before sign-up dates were stored go last
const byNewest = (a: { createdAt: number | null }, b: { createdAt: number | null }) => (b.createdAt ?? -Infinity) - (a.createdAt ?? -Infinity);

// Totals, new sign-ups and who is active, without internal and test companies
export async function adminOverviewHandler(req: CallableRequest): Promise<Overview> {
  await requireAdmin(req);
  const db = getFirestore();
  const now = Date.now();
  const users = await allUsers();
  const logins = new Map(users.map((u) => [u.uid, u]));
  const companies = await db.collection(paths.companies()).get();
  const facts = await Promise.all(companies.docs.map((d) => companyFacts(db, d, logins, now)));

  // People who only belong to internal companies are left out; people with no company are counted
  const inReal = new Set<string>();
  const inInternal = new Set<string>();
  for (const f of facts) for (const m of f.members.docs) (f.row.internal ? inInternal : inReal).add(m.id);
  const people = users.filter((u) => inReal.has(u.uid) || !inInternal.has(u.uid));
  const real = facts.filter((f) => !f.row.internal);

  const within = (t: number | null, days: number) => t !== null && now - t < days * DAY;
  const joined = (u: UserRecord) => ms(u.metadata.creationTime);

  // 13 weeks, each starting Monday (UTC), oldest first
  const today = new Date(now);
  const monday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - ((today.getUTCDay() + 6) % 7) * DAY;
  const first = monday - 12 * 7 * DAY;
  const signupsByWeek = Array.from({ length: 13 }, (_, i) => ({ week: new Date(first + i * 7 * DAY).toISOString().slice(0, 10), companies: 0, people: 0 }));
  const bucket = (t: number | null) => (t === null || t < first ? undefined : signupsByWeek[Math.floor((t - first) / (7 * DAY))]);
  for (const f of real) { const w = bucket(f.createdAt); if (w) w.companies++; }
  for (const u of people) { const w = bucket(joined(u)); if (w) w.people++; }

  return pick<Overview>({
    companies: real.length,
    people: people.length,
    newCompanies7: real.filter((f) => within(f.createdAt, 7)).length,
    newCompanies30: real.filter((f) => within(f.createdAt, 30)).length,
    newPeople7: people.filter((u) => within(joined(u), 7)).length,
    newPeople30: people.filter((u) => within(joined(u), 30)).length,
    activeCompanies7: real.filter((f) => f.row.status === 'active').length,
    activePeople7: people.filter((u) => within(lastActiveOf(u), 7)).length,
    signupsByWeek,
  }, ADMIN_FIELDS.overview);
}

// One row per company, internal ones included and marked
export async function adminCompaniesHandler(req: CallableRequest): Promise<{ rows: CompanyRow[] }> {
  await requireAdmin(req);
  const db = getFirestore();
  const now = Date.now();
  const logins = new Map((await allUsers()).map((u) => [u.uid, u]));
  const companies = await db.collection(paths.companies()).get();
  const facts = await Promise.all(companies.docs.map((d) => companyFacts(db, d, logins, now)));
  return { rows: facts.sort(byNewest).map((f) => toRow(f.row)) };
}

// One company: its people, its projects (names and dates, no content) and its first steps
export async function adminCompanyHandler(req: CallableRequest): Promise<CompanyDetail> {
  await requireAdmin(req);
  const { cid } = parse(adminCompanyInput, req.data);
  const db = getFirestore();
  const doc = await db.doc(paths.company(cid)).get();
  if (!doc.exists) throw new HttpsError('not-found', 'That company was not found.');
  const ids = (await db.collection(paths.members(cid)).select().get()).docs.map((d) => d.id);
  const ownerId = doc.data()?.ownerId;
  const logins = await usersById(ownerId && !ids.includes(ownerId) ? [...ids, ownerId] : ids);
  const f = await companyFacts(db, doc, logins, Date.now());

  const members = f.members.docs.map((m) => {
    const d = m.data();
    const u = logins.get(m.id);
    return pick<AdminPerson>({
      id: m.id, name: d.name || u?.displayName || '', email: d.email || u?.email || '', role: d.role || '',
      lastActive: iso(u ? lastActiveOf(u) : null), disabled: !!u?.disabled, invitePending: !!d.invitePending,
    }, ADMIN_FIELDS.person);
  });
  const projectList = f.sites.docs.map((s) => {
    const d = s.data();
    return pick<AdminProject>({ id: s.id, name: d.name || '', status: d.status || '', lastReportDate: d.lastReportDate || null, sample: !!d.sample }, ADMIN_FIELDS.project);
  });
  // Budget set: read each real project's finance record, keep only yes or no
  const budgets = await Promise.all(f.real.map((s) => db.doc(paths.finance(cid, s.id)).get()));
  const budgetSet = budgets.some((b) => Number(b.data()?.budget) > 0);
  const steps = gettingStartedSteps({
    hasDetails: !!(f.company.phone || f.company.location), realProjects: f.real.length, members: f.members.size,
    reported: f.real.some((s) => !!s.data().lastReportDate), budgetSet,
  });
  return pick<CompanyDetail>({ ...f.row, members, projectList, steps }, ADMIN_FIELDS.companyDetail);
}

// Look someone up by email: their login, when they last used SiteFlow and the companies they belong to
export async function adminFindUserHandler(req: CallableRequest): Promise<{ user: AdminUser | null }> {
  await requireAdmin(req);
  const { email } = parse(adminFindUserInput, req.data);
  const u = await getAuth().getUserByEmail(email.toLowerCase()).catch((e) => {
    if (e?.code === 'auth/user-not-found') return null;
    throw e;
  });
  if (!u) return { user: null };
  const db = getFirestore();
  const profile = (await db.doc(paths.user(u.uid)).get()).data();
  const ids = [...new Set([...(profile?.companyIds || []), ...(profile?.companyId ? [profile.companyId] : [])] as string[])];
  const companies: AdminUser['companies'] = [];
  for (const cid of ids) {
    const [[company], [member]] = await Promise.all([
      db.getAll(db.doc(paths.company(cid)), { fieldMask: ['name'] }),
      db.getAll(db.doc(paths.member(cid, u.uid)), { fieldMask: ['role'] }),
    ]);
    if (!company.exists || !member.exists) continue;
    companies.push({ id: cid, name: company.data()?.name || '', role: member.data()?.role || '' });
  }
  return {
    user: pick<AdminUser>({
      id: u.uid, email: u.email || '', name: profile?.name || u.displayName || '', disabled: u.disabled,
      createdAt: iso(ms(u.metadata.creationTime)), lastActive: iso(lastActiveOf(u)), companies,
    }, ADMIN_FIELDS.user),
  };
}

// The newest 100 admin actions
export async function adminLogListHandler(req: CallableRequest): Promise<{ entries: LogEntry[] }> {
  await requireAdmin(req);
  const snap = await getFirestore().collection('adminLog').orderBy('at', 'desc').limit(100).get();
  return {
    entries: snap.docs.map((d) => {
      const e = d.data();
      return pick<LogEntry>({ id: d.id, who: e.who || '', action: e.action || '', target: e.target || '', at: iso(ms(e.at)) }, ADMIN_FIELDS.logEntry);
    }),
  };
}

// One line in the admin log for something the admin did. Never goes into a company's own activity feed.
export async function logAdmin(db: Firestore, admin: { uid: string; name: string }, action: string, target: string) {
  await db.collection('adminLog').add({ who: admin.name, whoId: admin.uid, action, target, at: FieldValue.serverTimestamp() });
}

// A login that exists, or a clear "not found"
async function loginOf(uid: string) {
  return getAuth().getUser(uid).catch((e) => {
    if (e?.code === 'auth/user-not-found') throw new HttpsError('not-found', 'That person was not found.');
    throw e;
  });
}

// Email someone a link to choose a new password
export async function adminSendPasswordResetHandler(req: CallableRequest): Promise<{ email: 'sent' | 'failed' | 'skipped' }> {
  const admin = await requireAdmin(req);
  const { uid } = parse(adminUserActionInput, req.data);
  const user = await loginOf(uid);
  if (!user.email) throw new HttpsError('failed-precondition', 'That login has no email address.');
  const link = await getAuth().generatePasswordResetLink(user.email, { url: `${APP_URL}/login` });
  const text = `Hi,

SiteFlow was asked to send you a link to set a new password.

Set it here:
${link}

If you didn't expect this, you can ignore this email.

SiteFlow`;
  const html = `<p>Hi,</p><p>SiteFlow was asked to send you a link to set a new password.</p><p><a href="${link}">Set a new password</a></p><p>If you didn't expect this, you can ignore this email.</p><p>SiteFlow</p>`;
  const res = await sendEmail(user.email, 'Reset your SiteFlow password', text, { html }).catch((e) => {
    logger.warn('Password reset email failed', { error: String(e) });
    return { status: 'failed' as const };
  });
  await logAdmin(getFirestore(), admin, 'password reset', user.email);
  return { email: res.status };
}

// A fresh invitation for someone who has not accepted yet. The link stays in the email.
export async function adminResendInviteHandler(req: CallableRequest): Promise<Omit<IssuedInvite, 'link'>> {
  const admin = await requireAdmin(req);
  const { cid, uid } = parse(adminInviteInput, req.data);
  const db = getFirestore();
  const snap = await db.doc(paths.member(cid, uid)).get();
  if (!snap.exists) throw new HttpsError('not-found', 'That person was not found in this company.');
  const m = snap.data()!;
  if (!m.invitePending) throw new HttpsError('failed-precondition', 'That person has already accepted their invitation.');
  const { link: _link, ...issued } = await issueInvite(db, { id: uid, companyId: cid, email: m.email, name: m.name, role: m.role }, admin, m.inviteKind === 'reset' ? 'reset' : 'invite');
  await logAdmin(db, admin, 'resent invite', m.email || uid);
  return issued;
}

// Switch a login off (or back on). Switching off also signs the person out everywhere.
export async function adminSetLoginDisabledHandler(req: CallableRequest): Promise<{ disabled: boolean }> {
  const admin = await requireAdmin(req);
  const { uid, disabled } = parse(adminDisableInput, req.data);
  if (uid === admin.uid) throw new HttpsError('failed-precondition', "You can't switch off your own login.");
  const user = await loginOf(uid);
  await getAuth().updateUser(uid, { disabled });
  if (disabled) await getAuth().revokeRefreshTokens(uid);
  await logAdmin(getFirestore(), admin, disabled ? 'switched off login' : 'switched on login', user.email || uid);
  return { disabled };
}

// Change one flag on a company (suspended or internal), then log it under the company's name
async function setCompanyFlag(req: CallableRequest, action: [string, string], change: (admin: { name: string }, on: boolean) => Record<string, unknown>) {
  const admin = await requireAdmin(req);
  const { cid, on } = parse(adminCompanyFlagInput, req.data);
  const db = getFirestore();
  const ref = db.doc(paths.company(cid));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That company was not found.');
  await ref.update(change(admin, on));
  await logAdmin(db, admin, on ? action[0] : action[1], snap.data()?.name || cid);
  return { on };
}

// Pause a company's account (its people see the paused screen), or lift the pause
export const adminSetCompanySuspendedHandler = (req: CallableRequest) =>
  setCompanyFlag(req, ['suspended company', 'unsuspended company'], (admin, on) => ({ suspended: on ? { by: admin.name, at: FieldValue.serverTimestamp() } : null }));

// Mark a company as ours (test or demo), so it is left out of every count
export const adminSetCompanyInternalHandler = (req: CallableRequest) =>
  setCompanyFlag(req, ['marked company internal', 'unmarked company internal'], (_admin, on) => ({ internal: on }));

export const adminOverview = onCall(callOpts, adminOverviewHandler);
export const adminCompanies = onCall(callOpts, adminCompaniesHandler);
export const adminCompany = onCall(callOpts, adminCompanyHandler);
export const adminFindUser = onCall(callOpts, adminFindUserHandler);
export const adminLogList = onCall(callOpts, adminLogListHandler);
export const adminSendPasswordReset = onCall({ ...callOpts, secrets: [EMAIL_KEY] }, adminSendPasswordResetHandler);
export const adminResendInvite = onCall({ ...callOpts, secrets: [EMAIL_KEY] }, adminResendInviteHandler);
export const adminSetLoginDisabled = onCall(callOpts, adminSetLoginDisabledHandler);
export const adminSetCompanySuspended = onCall(callOpts, adminSetCompanySuspendedHandler);
export const adminSetCompanyInternal = onCall(callOpts, adminSetCompanyInternalHandler);
