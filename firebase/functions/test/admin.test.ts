// The platform admin's read functions, against the Auth and Firestore emulators: only the owner of
// SiteFlow gets in, and the answers carry counts and dates, never a client's report or money text.
import { beforeAll, describe, expect, it } from 'vitest';
import '../src/setup';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { ADMIN_FIELDS, paths, todayKey } from '@siteflow/shared';
import { adminCompaniesHandler, adminCompanyHandler, adminFindUserHandler, adminLogListHandler, adminOverviewHandler, lastActiveOf, pick } from '../src/admin';

const db = getFirestore();
const ADMIN = { uid: 'platform-owner', token: { platformAdmin: true, name: 'Sam Owner' } };
// A fake callable request, as the handlers get it from onCall
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = (data: unknown = {}, auth: unknown = ADMIN) => ({ auth, data }) as any;
const allowed = (row: object, keys: readonly string[]) => Object.keys(row).every((k) => keys.includes(k));

// Wipe both emulators so companies seeded by the other test files don't change the totals
async function wipe() {
  const fs = process.env.FIRESTORE_EMULATOR_HOST;
  const auth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!fs || !auth) throw new Error('Run with the auth and firestore emulators (pnpm run test:functions).');
  await fetch(`http://${fs}/emulator/v1/projects/demo-siteflow/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${auth}/emulator/v1/projects/demo-siteflow/accounts`, { method: 'DELETE' });
}

async function person(uid: string, email: string, name: string, cid: string | null, role = 'owner') {
  await getAuth().createUser({ uid, email, displayName: name, password: 'secret-123' });
  if (!cid) return;
  await db.doc(paths.user(uid)).set({ name, email, companyIds: [cid], companyId: cid });
  await db.doc(paths.member(cid, uid)).set({ role, name, email, siteIds: [], active: true, invitePending: false });
}

beforeAll(async () => {
  await wipe();
  const now = Timestamp.now();
  // Real company: one real project with a report today and a budget
  await db.doc(paths.company('co-real')).set({ name: 'Asante Builders', ownerId: 'u-ama', country: 'GH', createdAt: now, modules: {} });
  await person('u-ama', 'ama@example.com', 'Ama Asante', 'co-real');
  await person('u-kofi', 'kofi@example.com', 'Kofi Mensah', 'co-real', 'supervisor');
  await db.doc(paths.site('co-real', 's1')).set({ name: 'Adenta Villas', status: 'active', lastReportDate: todayKey() });
  await db.doc(paths.finance('co-real', 's1')).set({ budget: 250000, spent: 1200 });
  await db.collection(paths.sub('co-real', 's1', 'reports')).add({
    companyId: 'co-real', siteId: 's1', siteName: 'Adenta Villas', date: todayKey(), time: '17:00', text: 'Cast lintels', issues: '', createdAt: now,
  });
  await db.collection(paths.activity('co-real')).add({ who: 'Ama Asante', whoId: 'u-ama', what: 'added Adenta Villas', at: now });
  // Never started: only a sample project, and from before sign-up dates and countries were stored
  await db.doc(paths.company('co-sample')).set({ name: 'Boateng Works', ownerId: 'u-yaw', modules: {} });
  await person('u-yaw', 'yaw@example.com', 'Yaw Boateng', 'co-sample');
  await db.doc(paths.site('co-sample', 'demo1')).set({ name: 'Sample tower', status: 'active', sample: true, lastReportDate: todayKey() });
  // Our own test company
  await db.doc(paths.company('co-internal')).set({ name: 'SiteFlow Test', ownerId: 'u-test', country: 'GH', createdAt: now, internal: true, modules: {} });
  await person('u-test', 'test@siteflow.app', 'Test Owner', 'co-internal');
  await db.doc(paths.site('co-internal', 'x1')).set({ name: 'Test site', status: 'active' });
  // A login with no profile at all
  await person('u-lost', 'lost@example.com', 'Lost Person', null);
  await db.collection('adminLog').add({ who: 'Sam Owner', whoId: 'platform-owner', action: 'password reset', target: 'kofi@example.com', at: now });
});

describe('admin access', () => {
  const calls: [string, (r: ReturnType<typeof req>) => Promise<unknown>, unknown][] = [
    ['adminOverview', adminOverviewHandler, {}],
    ['adminCompanies', adminCompaniesHandler, {}],
    ['adminCompany', adminCompanyHandler, { cid: 'co-real' }],
    ['adminFindUser', adminFindUserHandler, { email: 'ama@example.com' }],
    ['adminLogList', adminLogListHandler, {}],
  ];
  it.each(calls)('%s refuses anyone without the platform admin claim', async (_name, fn, data) => {
    await expect(fn(req(data, null))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(fn(req(data, { uid: 'u-ama', token: {} }))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(fn(req(data, { uid: 'u-ama', token: { platformAdmin: 'true' } }))).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('admin helpers', () => {
  it('last active is the last token refresh, else the last sign-in, else unknown', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const login = (metadata: object) => ({ metadata }) as any;
    expect(lastActiveOf(login({ lastSignInTime: 'Mon, 19 Oct 2026 08:00:00 GMT', lastRefreshTime: '2026-10-21T09:30:00.000Z' }))).toBe(Date.parse('2026-10-21T09:30:00Z'));
    expect(lastActiveOf(login({ lastSignInTime: 'Mon, 19 Oct 2026 08:00:00 GMT', lastRefreshTime: null }))).toBe(Date.parse('2026-10-19T08:00:00Z'));
    expect(lastActiveOf(login({}))).toBeNull();
  });

  it('pick keeps only the listed keys', () => {
    expect(pick({ id: 'a', name: 'B', text: 'secret' }, ['id', 'name', 'missing'])).toEqual({ id: 'a', name: 'B' });
  });
});

describe('admin overview', () => {
  it('counts real companies and their people, leaving the internal company out', async () => {
    const o = await adminOverviewHandler(req());
    expect(allowed(o, ADMIN_FIELDS.overview)).toBe(true);
    expect(o).toMatchObject({ companies: 2, newCompanies7: 1, newCompanies30: 1, activeCompanies7: 1 });
    expect(o.people).toBe(4); // Ama, Kofi, Yaw and the login with no company; not the test owner
    expect(o.newPeople7).toBe(4);
    expect(o.signupsByWeek).toHaveLength(13);
    const last = o.signupsByWeek[12];
    expect(new Date(`${last.week}T00:00:00Z`).getUTCDay()).toBe(1); // weeks start on Monday
    expect(last).toMatchObject({ companies: 1, people: 4 });
    expect(o.signupsByWeek.slice(0, 12).every((w) => w.companies === 0 && w.people === 0)).toBe(true);
  });
});

describe('admin companies', () => {
  it('gives each company a status, keeps the internal one marked, and sorts unknown sign-up dates last', async () => {
    const { rows } = await adminCompaniesHandler(req());
    expect(rows.map((r) => r.id).sort()).toEqual(['co-internal', 'co-real', 'co-sample']);
    expect(rows[rows.length - 1].id).toBe('co-sample');
    for (const r of rows) expect(allowed(r, ADMIN_FIELDS.companyRow)).toBe(true);
    const real = rows.find((r) => r.id === 'co-real')!;
    const sample = rows.find((r) => r.id === 'co-sample')!;
    expect([real.status, sample.status]).toEqual(['active', 'never']);
    expect(real).toMatchObject({ name: 'Asante Builders', ownerName: 'Ama Asante', ownerEmail: 'ama@example.com', people: 2, projects: 1, sampleOnly: false, reports7d: 1, internal: false, suspended: false });
    expect(real.lastActive).toEqual(expect.any(String));
    expect(sample).toMatchObject({ createdAt: null, country: 'GH', projects: 0, sampleOnly: true, reports7d: 0 });
    expect(rows.find((r) => r.id === 'co-internal')).toMatchObject({ internal: true });
    const text = JSON.stringify(rows);
    expect(text).not.toContain('Cast lintels');
    expect(text).not.toContain('250000');
    expect(text).not.toContain('added Adenta Villas');
  });
});

describe('admin company detail', () => {
  it('lists people, projects and getting-started steps with counts only', async () => {
    const c = await adminCompanyHandler(req({ cid: 'co-real' }));
    expect(allowed(c, ADMIN_FIELDS.companyDetail)).toBe(true);
    for (const m of c.members) expect(allowed(m, ADMIN_FIELDS.person)).toBe(true);
    for (const p of c.projectList) expect(allowed(p, ADMIN_FIELDS.project)).toBe(true);
    expect(c.members.map((m) => m.name).sort()).toEqual(['Ama Asante', 'Kofi Mensah']);
    expect(c.members.find((m) => m.id === 'u-kofi')).toMatchObject({ email: 'kofi@example.com', role: 'supervisor', disabled: false, invitePending: false });
    expect(c.projectList).toEqual([{ id: 's1', name: 'Adenta Villas', status: 'active', lastReportDate: todayKey(), sample: false }]);
    expect(Object.fromEntries(c.steps.map((s) => [s.key, s.done]))).toEqual({ details: false, project: true, team: true, report: true, budget: true });
    const text = JSON.stringify(c);
    expect(text).not.toContain('Cast lintels');
    expect(text).not.toContain('250000');
    expect(text).not.toContain('added Adenta Villas');
  });

  it('a sample-only company has no real project steps done', async () => {
    const c = await adminCompanyHandler(req({ cid: 'co-sample' }));
    expect(c).toMatchObject({ status: 'never', sampleOnly: true, createdAt: null, country: 'GH' });
    expect(c.steps.find((s) => s.key === 'project')?.done).toBe(false);
    expect(c.steps.find((s) => s.key === 'budget')?.done).toBe(false);
  });

  it('an unknown company is not found', async () => {
    await expect(adminCompanyHandler(req({ cid: 'nope' }))).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('admin people search', () => {
  it('finds a login with no profile, with no companies', async () => {
    const { user } = await adminFindUserHandler(req({ email: 'lost@example.com' }));
    expect(user).toMatchObject({ id: 'u-lost', email: 'lost@example.com', name: 'Lost Person', disabled: false, companies: [] });
    // (the Auth emulator stamps lastRefreshTime when a login is created, so lastActive is not checked here)
    expect(allowed(user!, ADMIN_FIELDS.user)).toBe(true);
  });

  it('lists the companies someone belongs to, with their role', async () => {
    const { user } = await adminFindUserHandler(req({ email: 'Kofi@Example.com ' }));
    expect(user?.companies).toEqual([{ id: 'co-real', name: 'Asante Builders', role: 'supervisor' }]);
  });

  it('an unknown email gives no user, and a bad one is refused', async () => {
    expect(await adminFindUserHandler(req({ email: 'nobody@example.com' }))).toEqual({ user: null });
    await expect(adminFindUserHandler(req({ email: 'not-an-email' }))).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('admin log', () => {
  it('lists entries with allow-listed keys only', async () => {
    const { entries } = await adminLogListHandler(req());
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ who: 'Sam Owner', action: 'password reset', target: 'kofi@example.com', at: expect.any(String) });
    expect(allowed(entries[0], ADMIN_FIELDS.logEntry)).toBe(true);
  });
});
