import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  SAMPLE_PREFIX, can, companyLocale, digestMail, digestMailTo, emailPrefsFor, emailPrefsInput, isSample, issueMail, issueMailTo, issueThread,
  maskContact, paths, prettyDate, reportMail, reportMailTo, reportThread, threadHeaders, todayKey,
  type Company, type EmailPrefs, type Issue, type IssueEvent, type Mail, type MailPerson, type Report, type Site,
} from '@siteflow/shared';
import { companyMembers } from './deliver';
import { SECRETS, sendEmail } from './notify';

// Reports and issues by email, as threads (see logic/mail in shared for who gets what and the
// email bodies). Sends are logged in companies/{cid}/notifications like every other message, with
// a fixed id so an event never emails someone twice, and failed sends are retried.

const APP_URL = process.env.APP_URL ?? 'https://siteflow.app';
const MAIL_DOMAIN = process.env.MAIL_DOMAIN ?? 'siteflow.app';
const KEEP_DAYS = 180;
const callOpts = { enforceAppCheck: false }; // the email settings page is opened from an email, without signing in
const sample = (sid: string) => sid.startsWith(SAMPLE_PREFIX);

// ---------- unsubscribe tokens ----------
// A signed token in each email's links: who (a person, or a client's email address) and which
// company. The signing key is made once and kept in system/mail, which no app can read.
let keyCache: Buffer | null = null;
async function signingKey(db: Firestore) {
  if (keyCache) return keyCache;
  const ref = db.doc('system/mail');
  const key = await db.runTransaction(async (t) => {
    const k = (await t.get(ref)).data()?.key as string | undefined;
    if (k) return k;
    const fresh = randomBytes(32).toString('base64');
    t.set(ref, { key: fresh, createdAt: FieldValue.serverTimestamp() });
    return fresh;
  });
  keyCache = Buffer.from(key, 'base64');
  return keyCache;
}
type TokenBody = { u?: string; e?: string; c: string };
export async function mailToken(db: Firestore, body: TokenBody) {
  const data = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = createHmac('sha256', await signingKey(db)).update(data).digest('base64url').slice(0, 32);
  return `${data}.${sig}`;
}
export async function readMailToken(db: Firestore, token: unknown): Promise<TokenBody | null> {
  if (typeof token !== 'string' || token.length > 600 || !/^[\w-]+\.[\w-]{32}$/.test(token)) return null;
  const [data, sig] = token.split('.');
  const want = createHmac('sha256', await signingKey(db)).update(data).digest('base64url').slice(0, 32);
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try { const b = JSON.parse(Buffer.from(data, 'base64url').toString()); return typeof b.c === 'string' && (typeof b.u === 'string' || typeof b.e === 'string') ? b : null; } catch { return null; }
}
const emailHash = (e: string) => createHash('sha256').update(e.trim().toLowerCase()).digest('hex');
// Clients who unsubscribed (they have no login, so their choice is kept by address)
const optedOut = async (db: Firestore, email: string) => (await db.doc(`mailOptOut/${emailHash(email)}`).get()).exists;

async function linksFor(db: Firestore, cid: string, who: { id?: string; email: string }, open: string) {
  const t = await mailToken(db, who.id ? { u: who.id, c: cid } : { e: who.email.toLowerCase(), c: cid });
  return { open, settings: `${APP_URL}/email-settings?t=${t}`, unsubscribe: `${APP_URL}/api/unsubscribe?t=${t}` };
}

// ---------- people ----------
// Members with their email choices (kept on users/{uid})
export async function mailPeople(db: Firestore, cid: string): Promise<MailPerson[]> {
  const members = await companyMembers(cid);
  if (!members.length) return [];
  const accounts = await db.getAll(...members.map((m) => db.doc(paths.user(m.id))));
  const prefs = new Map(accounts.map((a) => [a.id, a.data()?.emailPrefs as Partial<EmailPrefs> | undefined]));
  return members.map((m) => ({ ...m, emailPrefs: prefs.get(m.id) ?? null }));
}
const openFor = (m: Pick<MailPerson, 'role'>, sid: string, path: { manager: string; site: string }) => `${APP_URL}${can(m.role, 'sites.all') ? path.manager : path.site}`.replace('{sid}', sid);

// ---------- sending ----------
// Marks the first message of a thread (its Message-ID is the one the rest refer to)
async function threadStep(db: Firestore, cid: string, thread: string) {
  const ref = db.doc(`${paths.company(cid)}/mailThreads/${thread.replace(/[^\w.-]/g, '_')}`);
  return db.runTransaction(async (t) => {
    const s = await t.get(ref);
    const n = (s.data()?.count ?? 0) + 1;
    t.set(ref, { count: n, updatedAt: FieldValue.serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + 120 * 864e5) }, { merge: true });
    return n;
  });
}

export async function sendThreadMail(db: Firestore, d: {
  cid: string; siteId: string; key: string; thread: string; step: number; to: { id?: string; name: string; email: string };
  mail: Mail; unsubscribe: string; kind: 'report_email' | 'issue_email' | 'digest_email';
}) {
  const id = `${d.key}_${(d.to.id || emailHash(d.to.email).slice(0, 16))}_email`.replace(/[^\w-]/g, '_').slice(0, 300);
  const ref = db.collection(paths.notifications(d.cid)).doc(id);
  const headers = {
    ...(d.thread ? threadHeaders(d.thread, d.step === 1 ? 'first' : `${d.key}`, MAIL_DOMAIN) : {}),
    'List-Unsubscribe': `<${d.unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
  try {
    await ref.create({
      kind: d.kind, channel: 'email', to: maskContact(d.to.email), toName: d.to.name, siteId: d.siteId || null, text: d.mail.text.slice(0, 4000),
      status: 'sending', attempts: 0, createdAt: FieldValue.serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + KEEP_DAYS * 864e5),
      address: d.to.email, subject: d.mail.subject, html: d.mail.html, headers, // kept for retries, removed once sent
    });
  } catch (e: any) {
    if (e?.code === 6 || /already exists/i.test(String(e?.message))) return 'duplicate';
    throw e;
  }
  const r = await sendEmail(d.to.email, d.mail.subject, d.mail.text, { html: d.mail.html, headers });
  const retry = r.status === 'failed' && !!r.retry;
  await ref.update({
    status: r.status, error: r.error || '', retry, attempts: FieldValue.increment(1),
    ...(r.status === 'sent' ? { sentAt: FieldValue.serverTimestamp() } : {}),
    ...(retry ? {} : { address: FieldValue.delete(), html: FieldValue.delete(), headers: FieldValue.delete() }),
  });
  return r.status;
}

// ---------- daily reports ----------
export async function mailReport(cid: string, sid: string, rid: string, r: Report & { createdByRole?: string; thumbs?: string[] }) {
  if (sample(sid)) return 0;
  const db = getFirestore();
  const site = (await db.doc(paths.site(cid, sid)).get()).data() as Site | undefined;
  if (!site) return 0;
  const people = reportMailTo(await mailPeople(db, cid), sid, r.createdBy);
  const thread = reportThread(cid, sid, r.date);
  const step = await threadStep(db, cid, thread);
  let sent = 0;
  for (const m of people) {
    const links = await linksFor(db, cid, { id: m.id, email: m.email! }, openFor(m, sid, { manager: `/sites/{sid}?tab=reports`, site: `/work/{sid}?tab=history` }));
    const mail = reportMail(r, links, 'You get each daily report on your projects. Reports for one project and week are one conversation.');
    if (await sendThreadMail(db, { cid, siteId: sid, key: `rmail_${rid}`, thread, step, to: { id: m.id, name: m.name, email: m.email! }, mail, unsubscribe: links.unsubscribe, kind: 'report_email' }) === 'sent') sent++;
  }
  // The client, when the project is set to copy them
  const client = site.client?.email?.trim();
  if (site.clientReports && client && !(await optedOut(db, client))) {
    const links = await linksFor(db, cid, { email: client }, '');
    const mail = reportMail(r, links, `You get the daily reports for ${site.name} as the client.`);
    if (await sendThreadMail(db, { cid, siteId: sid, key: `rmail_${rid}`, thread, step, to: { name: site.client?.name || 'Client', email: client }, mail, unsubscribe: links.unsubscribe, kind: 'report_email' }) === 'sent') sent++;
  }
  return sent;
}

// ---------- issues ----------
export async function mailIssue(cid: string, sid: string, iid: string, issue: Issue, ev: IssueEvent, key: string, actorId?: string) {
  if (sample(sid)) return 0;
  const db = getFirestore();
  const comments = await db.collection(paths.issueComments(cid, sid, iid)).select('createdBy').get();
  const commenters = [...new Set(comments.docs.map((c) => c.data().createdBy as string))];
  const people = issueMailTo(await mailPeople(db, cid), issue, { actorId, commenters });
  const thread = issueThread(cid, sid, iid);
  const step = await threadStep(db, cid, thread);
  let sent = 0;
  for (const m of people) {
    const links = await linksFor(db, cid, { id: m.id, email: m.email! }, `${APP_URL}/issues/${sid}/${iid}`);
    const mine = emailPrefsFor(m.emailPrefs, m.role).issues === 'mine';
    const mail = issueMail(issue, ev, links, mine ? 'You get emails about issues you raised, were given or commented on.' : 'You get emails about all issues on your projects.');
    if (await sendThreadMail(db, { cid, siteId: sid, key, thread, step, to: { id: m.id, name: m.name, email: m.email! }, mail, unsubscribe: links.unsubscribe, kind: 'issue_email' }) === 'sent') sent++;
  }
  return sent;
}

// A comment on an issue (status notes come with the status change email instead)
export const onIssueComment = onDocumentCreated({ document: 'companies/{cid}/sites/{sid}/issues/{iid}/comments/{cmid}', secrets: SECRETS }, async (event) => {
  const { cid, sid, iid, cmid } = event.params;
  const c = event.data?.data();
  if (!c || c.kind !== 'comment' || sample(sid)) return;
  const issue = (await getFirestore().doc(paths.subDoc(cid, sid, 'issues', iid)).get()).data() as Issue | undefined;
  if (!issue) return;
  await mailIssue(cid, sid, iid, issue, { kind: 'comment', by: c.createdByName, text: c.text }, `imail_${iid}_c_${cmid}`, c.createdBy);
});

// ---------- evening summary ----------
// Each person who chose "one summary in the evening": today's reports on their projects
export async function sendReportDigests(company: Company, now = new Date()) {
  const db = getFirestore();
  const tz = companyLocale(company).timeZone;
  const today = todayKey(now, tz);
  const people = digestMailTo(await mailPeople(db, company.id));
  if (!people.length) return 0;
  const sites = (await db.collection(paths.sites(company.id)).where('status', '==', 'active').get()).docs
    .map((d) => ({ id: d.id, ...d.data() }) as Site).filter((s) => !isSample(s));
  const todays = new Map<string, (Report & { id: string })[]>();
  for (const s of sites) {
    const rs = await db.collection(paths.sub(company.id, s.id, 'reports')).where('date', '==', today).get();
    todays.set(s.id, rs.docs.map((d) => ({ id: d.id, ...d.data() }) as Report & { id: string }));
  }
  let sent = 0;
  for (const m of people) {
    const mine = sites.filter((s) => can(m.role, 'sites.all') || m.siteIds?.includes(s.id));
    if (!mine.length) continue;
    const reports = mine.flatMap((s) => (todays.get(s.id) || []).map((r) => ({ ...r, link: openFor(m, s.id, { manager: `/sites/{sid}?tab=reports`, site: `/work/{sid}?tab=history` }) })));
    const missing = mine.filter((s) => !(todays.get(s.id) || []).length).map((s) => s.name);
    const links = await linksFor(db, company.id, { id: m.id, email: m.email! }, APP_URL);
    const mail = digestMail(m.name, prettyDate(today), reports, missing, links);
    if (await sendThreadMail(db, { cid: company.id, siteId: '', key: `digest_${today}`, thread: '', step: 1, to: { id: m.id, name: m.name, email: m.email! }, mail, unsubscribe: links.unsubscribe, kind: 'digest_email' }) === 'sent') sent++;
  }
  return sent;
}

// ---------- email settings from an email (no sign-in) ----------
async function settingsTarget(db: Firestore, token: unknown) {
  const t = await readMailToken(db, token);
  if (!t) throw new HttpsError('invalid-argument', 'This link is not valid. Open your email settings from SiteFlow instead.');
  return t;
}

// What the email settings page shows
export const emailSettings = onCall(callOpts, async (req) => {
  const db = getFirestore();
  const t = await settingsTarget(db, req.data?.token);
  const company = (await db.doc(paths.company(t.c)).get()).data() as Company | undefined;
  if (t.e) return { kind: 'client', email: maskContact(t.e), companyName: company?.name ?? '', subscribed: !(await optedOut(db, t.e)) };
  const member = (await db.doc(paths.member(t.c, t.u!)).get()).data();
  const account = (await db.doc(paths.user(t.u!)).get()).data();
  if (!account) throw new HttpsError('not-found', 'This account no longer exists.');
  return { kind: 'person', name: account.name ?? '', email: maskContact(account.email ?? ''), companyName: company?.name ?? '', prefs: emailPrefsFor(account.emailPrefs, member?.role) };
});

// Saves the choices from the email settings page
export const saveEmailSettings = onCall(callOpts, async (req) => {
  const db = getFirestore();
  const t = await settingsTarget(db, req.data?.token);
  if (t.e) {
    const ref = db.doc(`mailOptOut/${emailHash(t.e)}`);
    if (req.data?.subscribed === true) await ref.delete(); else await ref.set({ at: FieldValue.serverTimestamp() });
    return { ok: true };
  }
  const v = emailPrefsInput.safeParse(req.data?.prefs);
  if (!v.success) throw new HttpsError('invalid-argument', 'Choose your email settings.');
  await db.doc(paths.user(t.u!)).update({ emailPrefs: v.data, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true, prefs: v.data };
});

// One-click unsubscribe (List-Unsubscribe-Post from Gmail and others), and the link in the email
export const unsubscribe = onRequest({ cors: false }, async (req, res) => {
  const db = getFirestore();
  const token = (req.query.t ?? req.body?.t) as string | undefined;
  if (req.method === 'POST') {
    const t = await readMailToken(db, token);
    if (!t) { res.status(400).send('Invalid link'); return; }
    if (t.e) await db.doc(`mailOptOut/${emailHash(t.e)}`).set({ at: FieldValue.serverTimestamp() });
    else await db.doc(paths.user(t.u!)).update({ emailPrefs: { reports: 'off', issues: 'off' }, updatedAt: FieldValue.serverTimestamp() }).catch(() => {});
    logger.info('Unsubscribed by one click', { company: t.c });
    res.status(200).send('Unsubscribed');
    return;
  }
  // Opening the link shows the settings page, where they choose (nothing changes on a GET:
  // mail scanners open links)
  res.redirect(302, `${APP_URL}/email-settings?t=${encodeURIComponent(String(token ?? ''))}&unsubscribe=1`);
});
