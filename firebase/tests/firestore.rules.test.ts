import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { PERMISSIONS, ROLES, can, issueDoc, paths, reportDoc, reportId, type Permission, type Role, type SiteCollection } from '@siteflow/shared';
import { C1, C2, OFF_USER, OTHER_OWNER, S1, S2, S9, SEEDED_REPORT, USERS, makeEnv, seed, site } from './setup';

let env: RulesTestEnvironment;
beforeAll(async () => { env = await makeEnv(); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await seed(env); });

const as = (uid: string): Firestore => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const asRole = (r: Role) => as(USERS[r]);
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
const today = '2026-06-15';

// A report exactly as the apps build it (reportDoc), at its fixed id {date}_{uid}
const report = (cid: string, sid: string, uid: string, name: string, extra: object = {}) => ({
  ...reportDoc(
    { text: 'Cast lintels', stage: 'Blockwork', progress: 30, workersPresent: 4 },
    { companyId: cid, siteId: sid, siteName: `Site ${sid}`, date: today, time: '17:00', uid, name, source: 'app' },
  ),
  createdAt: serverTimestamp(), ...extra,
});
function sendReport(db: Firestore, cid: string, sid: string, uid: string, name: string, extra: object = {}, id = reportId(today, uid)) {
  return setDoc(doc(db, paths.subDoc(cid, sid, 'reports', id)), report(cid, sid, uid, name, extra));
}

// Writes a material log and the matching stock change in one batch, the way the apps do
// Seeded profiles are named '<role> user'
const nameOf = (uid: string) => `${(Object.entries(USERS).find(([, id]) => id === uid)?.[0]) ?? 'someone'} user`;
type LogOpts = { type?: 'usage' | 'delivery' | 'adjustment'; qty?: number; cost?: number; stockChange?: number; note?: string; name?: string; extra?: object };
function logMaterial(db: Firestore, cid: string, sid: string, uid: string, o: LogOpts = {}) {
  const type = o.type ?? 'usage';
  const qty = o.qty ?? 5;
  const logRef = doc(collection(db, paths.sub(cid, sid, 'materialLogs')));
  const b = writeBatch(db);
  b.set(logRef, {
    materialId: 'cement', materialName: 'Cement', unit: 'bags', type, qty, cost: o.cost ?? 0, supplier: '', ref: '', note: o.note ?? '',
    date: today, createdBy: uid, createdByName: o.name ?? nameOf(uid), createdAt: serverTimestamp(), ...o.extra,
  });
  b.update(doc(db, paths.subDoc(cid, sid, 'materials', 'cement')), {
    stock: increment(o.stockChange ?? (type === 'usage' ? -qty : qty)), lastLogId: logRef.id,
  });
  return b.commit();
}

// ---------------------------------------------------------------------------
// Every permission in the shared table, checked against the rules for every role.
// If someone edits PERMISSIONS without updating the rules (or the reverse), this fails.
// ---------------------------------------------------------------------------
// team.manage is not a rules permission: team changes only happen in Cloud Functions
// (tested in apps/web/test/team.test.js).
const probes: Partial<Record<Permission, (db: Firestore, r: Role) => Promise<unknown>>> = {
  'company.settings': (db) => updateDoc(doc(db, paths.company(C1)), { name: 'Renamed Builders' }),
  'sites.all': (db) => getDoc(doc(db, paths.site(C1, S2))),
  'sites.manage': (db) => setDoc(doc(db, paths.site(C1, 'new-site')), site('New site')),
  'site.work': (db, r) => sendReport(db, C1, S1, USERS[r], `${r} user`),
  'finance.view': (db) => getDoc(doc(db, paths.finance(C1, S1))),
  'finance.edit': (db, r) => setDoc(doc(db, paths.subDoc(C1, S1, 'expenses', `probe-${r}`)), {
    date: today, category: 'Transport', note: '', amount: 200, createdBy: USERS[r], createdByName: `${r} user`, createdAt: serverTimestamp(),
  }),
  'audit.view': (db) => getDocs(collection(db, paths.activity(C1))),
};

describe('rules match the shared permission table', () => {
  it('every rules-enforced permission has a probe', () => {
    expect(Object.keys(PERMISSIONS).filter((p) => !(p in probes))).toEqual(['team.manage']);
  });
  for (const perm of Object.keys(probes) as Permission[]) {
    for (const role of ROLES) {
      const allowed = can(role, perm);
      it(`${role} ${allowed ? 'can' : 'cannot'} ${perm}`, async () => {
        const run = probes[perm]!(asRole(role), role);
        await (allowed ? assertSucceeds(run) : assertFails(run));
      });
    }
  }
});

describe('tenant isolation', () => {
  it('no role in company 1 can read or write company 2', async () => {
    for (const role of ROLES) {
      const db = asRole(role);
      await assertFails(getDoc(doc(db, paths.company(C2))));
      await assertFails(getDoc(doc(db, paths.site(C2, S9))));
      await assertFails(getDoc(doc(db, paths.finance(C2, S9))));
      await assertFails(getDocs(collection(db, paths.sub(C2, S9, 'reports'))));
      await assertFails(sendReport(db, C2, S9, USERS[role], `${role} user`));
      await assertFails(getDoc(doc(db, paths.user(OTHER_OWNER))));
    }
  });
  it('every collection of another company is closed to every role, for reading and writing', async () => {
    const siteColls: SiteCollection[] = ['materials', 'materialLogs', 'expenses', 'workers', 'workerPay', 'attendance', 'reports', 'milestones', 'issues',
      'rfis', 'inspections', 'punchItems', 'incidents', 'toolboxTalks', 'tasks', 'drawings', 'documents', 'changeOrders', 'subcontractors', 'billing'];
    const companyColls = ['equipment', 'notifications', 'activity'];
    for (const role of ROLES) {
      const db = asRole(role);
      for (const c of siteColls) {
        await assertFails(getDocs(collection(db, paths.sub(C2, S9, c))));
        await assertFails(setDoc(doc(db, paths.subDoc(C2, S9, c, 'x')), { createdBy: USERS[role], companyId: C2 }));
      }
      for (const c of companyColls) {
        await assertFails(getDocs(collection(db, `${paths.company(C2)}/${c}`)));
        await assertFails(setDoc(doc(db, `${paths.company(C2)}/${c}/x`), { createdBy: USERS[role] }));
      }
      await assertFails(getDocs(collection(db, paths.issueComments(C2, S9, 'i1'))));
      await assertFails(getDocs(collection(db, paths.sites(C2))));
      await assertFails(updateDoc(doc(db, paths.company(C2)), { name: 'Taken over' }));
      // Company-wide pages use collection-group queries: asking for another company's is refused
      await assertFails(getDocs(query(collectionGroup(db, 'reports'), where('companyId', '==', C2))));
      await assertFails(getDocs(query(collectionGroup(db, 'issues'), where('companyId', '==', C2))));
      // ...and so is asking without saying which company (it could return anyone's)
      await assertFails(getDocs(collectionGroup(db, 'reports')));
      await assertFails(getDocs(collectionGroup(db, 'issues')));
    }
  });
  it('nobody can move themselves into another company or raise their own role', async () => {
    for (const role of ROLES) {
      const db = asRole(role);
      await assertFails(updateDoc(doc(db, paths.user(USERS[role])), { companyId: C2 }));
      if (role !== 'owner') await assertFails(updateDoc(doc(db, paths.user(USERS[role])), { role: 'owner' }));
      await assertFails(updateDoc(doc(db, paths.user(USERS[role])), { siteIds: [S1, S2, S9] }));
    }
  });
  it('the other company owner cannot read company 1', async () => {
    const db = as(OTHER_OWNER);
    await assertFails(getDoc(doc(db, paths.site(C1, S1))));
    await assertFails(getDocs(query(collection(db, 'users'), where('companyId', '==', C1))));
  });
  it('signed-out users get nothing', async () => {
    await assertFails(getDoc(doc(anon(), paths.company(C1))));
    await assertFails(getDoc(doc(anon(), paths.site(C1, S1))));
  });
  it('a switched-off user loses access', async () => {
    await assertFails(getDoc(doc(as(OFF_USER), paths.site(C1, S1))));
    await assertFails(getDoc(doc(as(OFF_USER), paths.company(C1))));
  });
  it('a user with no profile gets nothing', async () => {
    await assertFails(getDoc(doc(as('stranger'), paths.company(C1))));
  });
});

describe('users and team', () => {
  it('everyone reads their own profile, nobody creates one from the client', async () => {
    await assertSucceeds(getDoc(doc(asRole('viewer'), paths.user(USERS.viewer))));
    await assertFails(setDoc(doc(as('newbie'), paths.user('newbie')), { companyId: 'newbie', role: 'owner', name: 'N', email: 'n@x.com', siteIds: [] }));
    await assertFails(setDoc(doc(as('newbie'), paths.user('newbie')), { companyId: C1, role: 'admin', name: 'N', email: 'n@x.com', siteIds: [] }));
  });
  it('team managers list the company', async () => {
    await assertSucceeds(getDocs(query(collection(asRole('admin'), 'users'), where('companyId', '==', C1))));
    await assertFails(getDocs(query(collection(asRole('viewer'), 'users'), where('companyId', '==', C1))));
  });
  it('people edit their own name and phone, nothing else', async () => {
    const db = asRole('supervisor');
    const me = doc(db, paths.user(USERS.supervisor));
    await assertSucceeds(updateDoc(me, { name: 'Kofi Asante', phone: '0241234567', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(me, { name: 'K' }));
    await assertFails(updateDoc(me, { role: 'manager' }));
    await assertFails(updateDoc(me, { siteIds: [S1, S2] }));
    await assertFails(updateDoc(me, { companyId: C2 }));
    await assertFails(updateDoc(me, { active: true }));
    await assertFails(updateDoc(me, { email: 'new@example.com' }));
    await assertFails(updateDoc(doc(asRole('admin'), paths.user(USERS.admin)), { role: 'owner' }));
  });
  it('the must-change-password flag can be cleared but never set by the user', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), paths.user(USERS.viewer)), { mustChangePassword: true }));
    const me = doc(asRole('viewer'), paths.user(USERS.viewer));
    await assertSucceeds(updateDoc(me, { mustChangePassword: false }));
    await assertFails(updateDoc(me, { mustChangePassword: true }));
  });
  it("nobody edits someone else's profile from the app (team changes go through functions)", async () => {
    await assertFails(updateDoc(doc(asRole('owner'), paths.user(USERS.viewer)), { role: 'admin' }));
    await assertFails(updateDoc(doc(asRole('admin'), paths.user(USERS.supervisor)), { siteIds: [S1, S2] }));
    await assertFails(updateDoc(doc(asRole('admin'), paths.user(USERS.viewer)), { active: false }));
    await assertFails(updateDoc(doc(asRole('owner'), paths.user(USERS.viewer)), { name: 'Renamed by owner' }));
  });
  it('a switched-off user cannot edit their profile', async () => {
    await assertFails(updateDoc(doc(as(OFF_USER), paths.user(OFF_USER)), { name: 'Still here' }));
  });
});

describe('invitation links', () => {
  it('nobody reads or writes invitation records from an app (only the server does)', async () => {
    await assertFails(getDoc(doc(asRole('owner'), 'invites/abc')));
    await assertFails(getDocs(collection(asRole('owner'), 'invites')));
    await assertFails(setDoc(doc(asRole('owner'), 'invites/abc'), { uid: USERS.admin }));
  });
});

describe('company', () => {
  it('nobody creates companies or changes plan and modules from the client', async () => {
    await assertFails(setDoc(doc(as('newbie'), paths.company('newbie')), { name: 'Free Co', ownerId: 'newbie', plan: 'enterprise', modules: {} }));
    await assertFails(updateDoc(doc(asRole('owner'), paths.company(C1)), { plan: 'enterprise' }));
    await assertFails(updateDoc(doc(asRole('owner'), paths.company(C1)), { modules: { portal: true } }));
    await assertFails(updateDoc(doc(asRole('admin'), paths.company(C1)), { name: 'Admin Renamed' }));
  });
  it('the owner sets the country, currency and time zone; badly shaped values and other roles are refused', async () => {
    const owner = doc(asRole('owner'), paths.company(C1));
    await assertSucceeds(updateDoc(owner, { country: 'KE', currency: 'KES', timeZone: 'Africa/Nairobi', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(owner, { timeZone: 'America/Argentina/Buenos_Aires' }));
    await assertFails(updateDoc(owner, { country: 'Kenya' }));
    await assertFails(updateDoc(owner, { currency: 'shillings' }));
    await assertFails(updateDoc(owner, { timeZone: '<script>' }));
    await assertFails(updateDoc(doc(asRole('admin'), paths.company(C1)), { currency: 'USD' }));
    await assertSucceeds(updateDoc(owner, { country: 'GH', currency: 'GHS', timeZone: 'Africa/Accra' }));
  });
  it('the owner edits company contact details', async () => {
    await assertSucceeds(updateDoc(doc(asRole('owner'), paths.company(C1)), { name: 'Mensah Builders Ltd', phone: '0302123456', location: 'Accra', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asRole('owner'), paths.company(C1)), { name: 'M' }));
    await assertFails(updateDoc(doc(asRole('owner'), paths.company(C1)), { ownerId: USERS.admin }));
  });
});

describe('sites', () => {
  it('site-scoped roles only see assigned sites', async () => {
    for (const r of ['supervisor', 'viewer'] as const) {
      await assertSucceeds(getDoc(doc(asRole(r), paths.site(C1, S1))));
      await assertFails(getDoc(doc(asRole(r), paths.site(C1, S2))));
      await assertFails(getDocs(collection(asRole(r), paths.sites(C1))));
    }
  });
  it('money never goes on the site document', async () => {
    await assertFails(setDoc(doc(asRole('owner'), paths.site(C1, 'x')), { ...site('X'), budget: 1000 }));
    await assertFails(updateDoc(doc(asRole('owner'), paths.site(C1, S1)), { spent: 5 }));
  });
  it('supervisor updates progress with a report, nothing else', async () => {
    const db = asRole('supervisor');
    await assertSucceeds(updateDoc(doc(db, paths.site(C1, S1)), { stage: 'Blockwork', progress: 30, lastReportDate: today, lastReportTime: '17:00' }));
    await assertFails(updateDoc(doc(db, paths.site(C1, S1)), { progress: 130, lastReportDate: today }));
    await assertFails(updateDoc(doc(db, paths.site(C1, S1)), { name: 'Hijacked' }));
    await assertFails(updateDoc(doc(db, paths.site(C1, S1)), { status: 'closed' }));
    await assertFails(updateDoc(doc(asRole('viewer'), paths.site(C1, S1)), { progress: 40, lastReportDate: today }));
    await assertFails(deleteDoc(doc(db, paths.site(C1, S1))));
  });
  it('site validation', async () => {
    await assertFails(setDoc(doc(asRole('manager'), paths.site(C1, 'bad')), { ...site('X'), name: '' }));
    await assertFails(setDoc(doc(asRole('manager'), paths.site(C1, 'bad')), { ...site('Fine'), status: 'deleted' }));
    await assertFails(setDoc(doc(asRole('manager'), paths.site(C1, 'bad')), { ...site('Fine'), hacked: true }));
  });
});

describe('site status, details and team', () => {
  const close = (sid: string, status = 'closed') => env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), paths.site(C1, sid)), { status }));

  it('a closed site is read-only for daily work, for every role', async () => {
    await close(S1);
    const sup = asRole('supervisor');
    await assertSucceeds(getDoc(doc(sup, paths.site(C1, S1))));
    await assertFails(sendReport(sup, C1, S1, USERS.supervisor, 'supervisor user'));
    await assertFails(setDoc(doc(sup, paths.attendance(C1, S1, today)), { date: today, marks: {}, markedBy: USERS.supervisor }));
    await assertFails(logMaterial(sup, C1, S1, USERS.supervisor));
    await assertFails(setDoc(doc(sup, paths.subDoc(C1, S1, 'workers', 'late')), { name: 'Late Worker', trade: 'Mason', active: true, createdBy: USERS.supervisor }));
    await assertFails(updateDoc(doc(sup, paths.site(C1, S1)), { progress: 99, lastReportDate: today }));
    await assertFails(sendReport(asRole('owner'), C1, S1, USERS.owner, 'owner user'));
  });
  it('an on-hold site still takes reports', async () => {
    await close(S1, 'on_hold');
    await assertSucceeds(sendReport(asRole('supervisor'), C1, S1, USERS.supervisor, 'supervisor user'));
  });
  it('site managers change status and can reopen a closed site', async () => {
    await close(S1);
    await assertSucceeds(updateDoc(doc(asRole('manager'), paths.site(C1, S1)), { status: 'active' }));
    await assertFails(updateDoc(doc(asRole('manager'), paths.site(C1, S1)), { status: 'archived' }));
    await assertFails(updateDoc(doc(asRole('supervisor'), paths.site(C1, S1)), { status: 'closed' }));
  });
  it('sites are never deleted', async () => {
    await assertFails(deleteDoc(doc(asRole('owner'), paths.site(C1, S2))));
  });
  it('planned dates and client details are checked', async () => {
    const db = asRole('manager');
    await assertSucceeds(updateDoc(doc(db, paths.site(C1, S1)), { planStart: '2026-01-05', planEnd: '2026-12-20', client: { name: 'Mr Mensah', phone: '0241234567', email: '' } }));
    await assertSucceeds(updateDoc(doc(db, paths.site(C1, S1)), { planStart: null, client: null }));
    await assertFails(updateDoc(doc(db, paths.site(C1, S1)), { planStart: 'next week' }));
    await assertFails(updateDoc(doc(db, paths.site(C1, S1)), { client: { name: 'X', bank: '123' } }));
  });
  it('project managers see the team to assign people; site roles do not', async () => {
    await assertSucceeds(getDocs(query(collection(asRole('manager'), 'users'), where('companyId', '==', C1))));
    await assertFails(getDocs(query(collection(asRole('finance'), 'users'), where('companyId', '==', C1))));
    await assertFails(getDocs(query(collection(asRole('supervisor'), 'users'), where('companyId', '==', C1))));
  });
});

describe('finance', () => {
  const expense = (uid: string, extra: object = {}) => ({
    date: today, category: 'Materials', note: 'Cement', amount: 300, payee: '', method: 'Cash', ref: '',
    createdBy: uid, createdByName: nameOf(uid), createdAt: serverTimestamp(), ...extra,
  });
  it('site roles cannot see budgets, spending, expenses or pay', async () => {
    for (const r of ['supervisor', 'viewer'] as const) {
      const db = asRole(r);
      await assertFails(getDoc(doc(db, paths.finance(C1, S1))));
      await assertFails(getDocs(collection(db, paths.sub(C1, S1, 'expenses'))));
      await assertFails(getDoc(doc(db, paths.workerPay(C1, S1, 'w1'))));
      await assertFails(getDocs(collection(db, paths.sub(C1, S1, 'billing'))));
    }
  });
  it('site roles cannot change money', async () => {
    const db = asRole('supervisor');
    await assertFails(updateDoc(doc(db, paths.finance(C1, S1)), { spent: 0 }));
    await assertFails(updateDoc(doc(db, paths.finance(C1, S1)), { budget: 1 }));
    await assertFails(setDoc(doc(db, paths.workerPay(C1, S1, 'w1')), { dailyRate: 999 }));
    await assertFails(setDoc(doc(db, paths.subDoc(C1, S1, 'expenses', 'x')), expense(USERS.supervisor)));
  });
  it('nobody writes spending totals from an app, not even the owner', async () => {
    for (const r of ['owner', 'manager', 'finance'] as const) {
      await assertFails(updateDoc(doc(asRole(r), paths.finance(C1, S1)), { spent: increment(200) }));
      await assertFails(updateDoc(doc(asRole(r), paths.finance(C1, S1)), { byCategory: { Materials: 1 } }));
    }
  });
  it('site managers set the budget, total and per category; finance cannot', async () => {
    await assertSucceeds(updateDoc(doc(asRole('manager'), paths.finance(C1, S1)), { budget: 200000, budgetByCategory: { Materials: 120000, Labour: 60000 } }));
    await assertFails(updateDoc(doc(asRole('finance'), paths.finance(C1, S1)), { budget: 1 }));
    await assertFails(updateDoc(doc(asRole('manager'), paths.finance(C1, S1)), { budget: -5 }));
    await assertFails(deleteDoc(doc(asRole('owner'), paths.finance(C1, S1))));
  });
  it('finance records, corrects and deletes expenses under their own name', async () => {
    const db = asRole('finance');
    const ref = doc(db, paths.subDoc(C1, S1, 'expenses', 'f1'));
    await assertSucceeds(setDoc(ref, expense(USERS.finance, { payee: 'Ghacem', method: 'Bank transfer', ref: 'INV-22' })));
    await assertFails(setDoc(doc(db, paths.subDoc(C1, S1, 'expenses', 'f2')), expense(USERS.finance, { createdByName: 'The Owner' })));
    await assertFails(setDoc(doc(db, paths.subDoc(C1, S1, 'expenses', 'f3')), expense(USERS.finance, { amount: 0 })));
    await assertFails(setDoc(doc(db, paths.subDoc(C1, S1, 'expenses', 'f4')), expense(USERS.finance, { date: 'yesterday' })));
    await assertFails(setDoc(doc(db, paths.subDoc(C1, S1, 'expenses', 'f5')), expense(USERS.finance, { approved: true })));
    await assertSucceeds(updateDoc(ref, { amount: 450, note: 'Corrected amount', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { createdBy: USERS.owner }));
    await assertSucceeds(deleteDoc(ref));
    await assertSucceeds(setDoc(doc(db, paths.workerPay(C1, S1, 'w1')), { dailyRate: 180, bankName: 'GCB', accountLast4: '1234' }));
  });
  it('new sites start with nothing spent', async () => {
    await assertFails(setDoc(doc(asRole('manager'), paths.finance(C1, 'new')), { budget: 10, spent: 5 }));
    await assertSucceeds(setDoc(doc(asRole('manager'), paths.finance(C1, 'new')), { budget: 10, spent: 0 }));
    await assertFails(setDoc(doc(asRole('finance'), paths.finance(C1, 'new2')), { budget: 10, spent: 0 }));
  });
});

describe('materials', () => {
  const cement = (db: Firestore) => doc(db, paths.subDoc(C1, S1, 'materials', 'cement'));
  it('supervisor records usage and deliveries; stock moves by exactly that amount', async () => {
    await assertSucceeds(logMaterial(asRole('supervisor'), C1, S1, USERS.supervisor, { qty: 5, note: 'Column casting' }));
    await assertSucceeds(logMaterial(asRole('supervisor'), C1, S1, USERS.supervisor, { type: 'delivery', qty: 20, extra: { supplier: 'Ghacem', ref: 'WB-881' } }));
  });
  it('usage may take the balance below zero (flagged for a stock count, not refused)', async () => {
    await assertSucceeds(logMaterial(asRole('supervisor'), C1, S1, USERS.supervisor, { qty: 80 }));
  });
  it('stock cannot be set directly or moved by the wrong amount, by anyone', async () => {
    await assertFails(updateDoc(cement(asRole('supervisor')), { stock: 9999 }));
    await assertFails(updateDoc(cement(asRole('manager')), { stock: 9999 }));
    await assertFails(updateDoc(cement(asRole('owner')), { name: 'Cement 50kg', stock: 1 }));
    await assertFails(logMaterial(asRole('supervisor'), C1, S1, USERS.supervisor, { qty: 5, stockChange: +50 }));
    await assertFails(logMaterial(asRole('supervisor'), C1, S1, 'someone-else', { qty: 5 }));
  });
  it('entries carry the real author name and are never edited or deleted', async () => {
    await assertFails(logMaterial(asRole('supervisor'), C1, S1, USERS.supervisor, { name: 'The Owner' }));
    await assertSucceeds(logMaterial(asRole('supervisor'), C1, S1, USERS.supervisor));
    let logs: string[] = [];
    await env.withSecurityRulesDisabled(async (ctx) => { logs = (await getDocs(collection(ctx.firestore(), paths.sub(C1, S1, 'materialLogs')))).docs.map((d) => d.id); });
    await assertFails(updateDoc(doc(asRole('manager'), paths.subDoc(C1, S1, 'materialLogs', logs[0])), { qty: 1 }));
    await assertFails(deleteDoc(doc(asRole('owner'), paths.subDoc(C1, S1, 'materialLogs', logs[0]))));
  });
  it('a log cannot be written without its stock change', async () => {
    await assertFails(setDoc(doc(asRole('supervisor'), paths.subDoc(C1, S1, 'materialLogs', 'lonely')), {
      materialId: 'cement', materialName: 'Cement', unit: 'bags', type: 'usage', qty: 1, cost: 0, supplier: '',
      date: today, createdBy: USERS.supervisor, createdByName: 'supervisor user',
    }));
  });
  it('stock counts: site managers only, with a reason, by the counted difference', async () => {
    await assertSucceeds(logMaterial(asRole('manager'), C1, S1, USERS.manager, { type: 'adjustment', qty: -7, note: 'Monthly count' }));
    await assertFails(logMaterial(asRole('supervisor'), C1, S1, USERS.supervisor, { type: 'adjustment', qty: -7, note: 'Monthly count' }));
    await assertFails(logMaterial(asRole('manager'), C1, S1, USERS.manager, { type: 'adjustment', qty: -7, note: '' }));
    await assertFails(logMaterial(asRole('manager'), C1, S1, USERS.manager, { type: 'adjustment', qty: 0, note: 'No change' }));
    await assertFails(logMaterial(asRole('manager'), C1, S1, USERS.manager, { type: 'adjustment', qty: -7, stockChange: +7, note: 'Wrong way' }));
  });
  it('only finance roles record a cost, and only on deliveries', async () => {
    await assertFails(logMaterial(asRole('supervisor'), C1, S1, USERS.supervisor, { type: 'delivery', qty: 10, cost: 500 }));
    await assertSucceeds(logMaterial(asRole('manager'), C1, S1, USERS.manager, { type: 'delivery', qty: 10, cost: 500 }));
    await assertFails(logMaterial(asRole('manager'), C1, S1, USERS.manager, { type: 'usage', qty: 1, cost: 50 }));
  });
  it('viewer cannot record and supervisor cannot record on other sites', async () => {
    await assertFails(logMaterial(asRole('viewer'), C1, S1, USERS.viewer));
    await assertFails(logMaterial(asRole('supervisor'), C1, S2, USERS.supervisor));
  });
  it('only site managers set up, edit and archive materials; materials are never deleted', async () => {
    const m = { name: 'Sand', unit: 'trips', stock: 0, reorderLevel: 1, avgDaily: 1 };
    await assertFails(setDoc(doc(asRole('supervisor'), paths.subDoc(C1, S1, 'materials', 'sand')), m));
    await assertFails(setDoc(doc(asRole('manager'), paths.subDoc(C1, S1, 'materials', 'neg')), { ...m, stock: -1 }));
    await assertSucceeds(setDoc(doc(asRole('manager'), paths.subDoc(C1, S1, 'materials', 'sand')), m));
    await assertSucceeds(updateDoc(cement(asRole('manager')), { name: 'Cement (50kg)', reorderLevel: 20, avgDaily: 8 }));
    await assertSucceeds(updateDoc(cement(asRole('manager')), { active: false }));
    await assertFails(updateDoc(cement(asRole('supervisor')), { active: true }));
    await assertFails(deleteDoc(cement(asRole('owner'))));
  });
});

describe('workers and attendance', () => {
  it('supervisor adds workers but cannot put pay on them', async () => {
    const db = asRole('supervisor');
    const w = { name: 'Ama Owusu', trade: 'Labourer', phone: '0241112222', active: true, createdBy: USERS.supervisor, createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db, paths.subDoc(C1, S1, 'workers', 'w2')), w));
    await assertFails(setDoc(doc(db, paths.subDoc(C1, S1, 'workers', 'w3')), { ...w, dailyRate: 150 }));
    await assertFails(setDoc(doc(db, paths.subDoc(C1, S1, 'workers', 'w4')), { ...w, active: false }));
  });
  it('supervisor fixes a name, trade or phone; only managers switch a worker off', async () => {
    const db = asRole('supervisor');
    const ref = doc(db, paths.subDoc(C1, S1, 'workers', 'w1'));
    await assertSucceeds(updateDoc(ref, { name: 'Yaw Boateng Jnr', trade: 'Mason', phone: '0201234567', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { active: false }));
    await assertFails(updateDoc(ref, { name: 'Y' }));
    await assertFails(updateDoc(doc(asRole('viewer'), paths.subDoc(C1, S1, 'workers', 'w1')), { name: 'Viewer Edit' }));
    await assertSucceeds(updateDoc(doc(asRole('manager'), paths.subDoc(C1, S1, 'workers', 'w1')), { active: false }));
  });
  it('attendance marks merge per worker', async () => {
    const db = asRole('supervisor');
    const ref = doc(db, paths.attendance(C1, S1, today));
    await assertSucceeds(setDoc(ref, { date: today, marks: { w1: 'present' }, markedBy: USERS.supervisor, updatedAt: serverTimestamp() }, { merge: true }));
    await assertSucceeds(setDoc(doc(asRole('manager'), paths.attendance(C1, S1, today)), { date: today, marks: { w2: 'late', w3: 'leave' }, markedBy: USERS.manager }, { merge: true }));
    await assertSucceeds(setDoc(ref, { date: today, marks: { w1: 'absent' }, markedBy: USERS.supervisor }, { merge: true }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      const s = await getDoc(doc(ctx.firestore(), paths.attendance(C1, S1, today)));
      expect(s.data()?.marks).toEqual({ w1: 'absent', w2: 'late', w3: 'leave' });
    });
  });
  it('attendance only takes the four statuses and carries no money', async () => {
    const db = asRole('supervisor');
    const ref = doc(db, paths.attendance(C1, S1, today));
    const ok = { date: today, marks: { w1: 'present' }, markedBy: USERS.supervisor };
    await assertFails(setDoc(ref, { ...ok, marks: { w1: 'sick' } }, { merge: true }));
    await assertFails(setDoc(ref, { ...ok, marks: { w1: true } }, { merge: true }));
    await assertFails(setDoc(ref, { ...ok, wages: 150 }, { merge: true }));
    await assertFails(setDoc(ref, { ...ok, markedBy: USERS.owner }, { merge: true }));
    await assertFails(setDoc(doc(db, paths.attendance(C1, S1, '2026-06-16')), ok));
    await assertFails(setDoc(doc(asRole('viewer'), paths.attendance(C1, S1, today)), { ...ok, markedBy: USERS.viewer }));
    await assertFails(setDoc(doc(asRole('finance'), paths.attendance(C1, S1, today)), { ...ok, markedBy: USERS.finance }));
    await assertSucceeds(setDoc(ref, ok, { merge: true }));
  });
  it('past days can be marked (with their own date)', async () => {
    const past = '2026-06-10';
    await assertSucceeds(setDoc(doc(asRole('supervisor'), paths.attendance(C1, S1, past)), { date: past, marks: { w1: 'late' }, markedBy: USERS.supervisor }, { merge: true }));
  });
});

describe('reports', () => {
  const sup = () => asRole('supervisor');
  const me = USERS.supervisor;
  const name = 'supervisor user';

  it('a supervisor sends a report on an assigned site', async () => {
    await assertSucceeds(sendReport(sup(), C1, S1, me, name));
  });
  it('the id must be today\'s date and the author, so resends cannot duplicate', async () => {
    await assertFails(sendReport(sup(), C1, S1, me, name, {}, 'random-id'));
    await assertFails(sendReport(sup(), C1, S1, me, name, {}, reportId(today, USERS.owner)));
    await assertFails(sendReport(sup(), C1, S1, me, name, {}, reportId('2026-06-14', me)));
  });
  it('a resend of the same report is refused, not duplicated', async () => {
    await assertSucceeds(sendReport(sup(), C1, S1, me, name));
    await assertFails(sendReport(sup(), C1, S1, me, name, { text: 'Second version' }));
  });
  it('cannot fake the author, company, site or name', async () => {
    const db = sup();
    await assertFails(sendReport(db, C1, S1, me, name, { createdBy: USERS.owner }));
    await assertFails(sendReport(db, C1, S1, me, 'The Owner'));
    await assertFails(sendReport(db, C1, S1, me, name, { companyId: C2 }));
    await assertFails(sendReport(db, C1, S1, me, name, { siteId: S2 }));
    await assertFails(sendReport(db, C1, S2, me, name));
  });
  it('fields are checked', async () => {
    const db = sup();
    for (const bad of [
      { progress: 150 }, { photos: Array(9).fill('x') }, { spent: 1 }, { workersPresent: -1 }, { workersPresent: 2.5 },
      { weather: 'Snow' }, { text: '' }, { source: 'whatsapp' }, { materialsUsed: 'lots' }, { thumbs: Array(9).fill('x') }, { thumbs: 'x' },
    ]) {
      await assertFails(sendReport(db, C1, S1, me, name, bad));
    }
    await assertSucceeds(sendReport(db, C1, S1, me, name, {
      notes: 'Inspector visited', issues: 'Cement short', weather: 'Light rain',
      materialsUsed: [{ materialId: 'cement', name: 'Cement', unit: 'bags', qty: 6 }],
      // Small copies of the photos are allowed alongside them
      photos: ['https://x/1.jpg'], thumbs: ['https://x/1-thumb.jpg'], photoCount: 1,
    }));
  });
  it('the author adds photo links only; nobody rewrites a report', async () => {
    const db = sup();
    const ref = doc(db, paths.subDoc(C1, S1, 'reports', SEEDED_REPORT));
    await assertSucceeds(updateDoc(ref, { photos: ['https://example.com/a.jpg'], photoCount: 1 }));
    await assertSucceeds(updateDoc(ref, { thumbs: ['https://example.com/a-thumb.jpg'] }));
    await assertFails(updateDoc(ref, { text: 'Rewritten' }));
    await assertFails(updateDoc(doc(asRole('manager'), paths.subDoc(C1, S1, 'reports', SEEDED_REPORT)), { text: 'Rewritten by manager' }));
    await assertFails(deleteDoc(ref));
    await assertSucceeds(deleteDoc(doc(asRole('manager'), paths.subDoc(C1, S1, 'reports', SEEDED_REPORT))));
  });
  it('viewer reads but cannot write', async () => {
    await assertSucceeds(getDocs(collection(asRole('viewer'), paths.sub(C1, S1, 'reports'))));
    await assertFails(sendReport(asRole('viewer'), C1, S1, USERS.viewer, 'viewer user'));
  });
});

describe('company-wide reports (collection group)', () => {
  const companyReports = (db: Firestore, cid: string) => getDocs(query(collectionGroup(db, 'reports'), where('companyId', '==', cid)));
  it('roles that see every site can list all company reports', async () => {
    for (const r of ['owner', 'admin', 'manager', 'finance'] as const) {
      const snap = await assertSucceeds(companyReports(asRole(r), C1));
      expect(snap.docs.every((d) => d.data().companyId === C1)).toBe(true);
      expect(snap.size).toBe(2);
    }
  });
  it('site-scoped roles, other companies and unfiltered queries are refused', async () => {
    await assertFails(companyReports(asRole('supervisor'), C1));
    await assertFails(companyReports(asRole('viewer'), C1));
    await assertFails(companyReports(as(OTHER_OWNER), C1));
    await assertFails(getDocs(collectionGroup(asRole('owner'), 'reports')));
  });
});

describe('issues', () => {
  const ref = (db: Firestore, id: string, sid = S1) => doc(db, paths.subDoc(C1, sid, 'issues', id));
  const issue = (uid: string, extra: object = {}, sid = S1) => ({
    ...issueDoc({ title: 'Scaffold is unsafe', priority: 'critical', category: 'Safety', description: 'Loose boards on level 2' },
      { companyId: C1, siteId: sid, siteName: `Site ${sid}`, uid, name: nameOf(uid), date: today }),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastActivityAt: serverTimestamp(), ...extra,
  });
  const seedIssue = (id: string, extra: object = {}) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), paths.subDoc(C1, S1, 'issues', id)), issue(USERS.supervisor, extra)));
  const sup = () => asRole('supervisor');

  it('a supervisor reports an issue on an assigned site', async () => {
    await assertSucceeds(setDoc(ref(sup(), 'i1'), issue(USERS.supervisor)));
  });
  it('reports must be honest and start open and unassigned (unless a manager assigns)', async () => {
    await assertFails(setDoc(ref(sup(), 'a'), issue(USERS.supervisor, { createdByName: 'The Owner' })));
    await assertFails(setDoc(ref(sup(), 'b'), issue(USERS.owner)));
    await assertFails(setDoc(ref(sup(), 'c'), issue(USERS.supervisor, { status: 'resolved', resolution: 'Done already' })));
    await assertFails(setDoc(ref(sup(), 'd'), issue(USERS.supervisor, { assignedTo: USERS.supervisor, assignedToName: 'supervisor user' })));
    await assertFails(setDoc(ref(sup(), 'e'), issue(USERS.supervisor, { priority: 'urgent' })));
    await assertFails(setDoc(ref(sup(), 'f'), issue(USERS.supervisor, { companyId: C2 })));
    await assertFails(setDoc(ref(sup(), 'g', S2), issue(USERS.supervisor, {}, S2)));
    await assertFails(setDoc(ref(asRole('viewer'), 'h'), issue(USERS.viewer)));
    await assertFails(setDoc(ref(asRole('finance'), 'i'), issue(USERS.finance)));
  });
  it('a manager reports and assigns, but only to someone in the company', async () => {
    await assertSucceeds(setDoc(ref(asRole('manager'), 'm1'), issue(USERS.manager, { assignedTo: USERS.supervisor, assignedToName: 'supervisor user' })));
    await assertFails(setDoc(ref(asRole('manager'), 'm2'), issue(USERS.manager, { assignedTo: OTHER_OWNER, assignedToName: 'Other owner' })));
  });
  it('managers assign and change priority; other supervisors cannot', async () => {
    await seedIssue('x');
    await assertSucceeds(updateDoc(ref(asRole('manager'), 'x'), { assignedTo: USERS.supervisor, assignedToName: 'supervisor user', priority: 'high' }));
    await assertFails(updateDoc(ref(asRole('manager'), 'x'), { assignedTo: OTHER_OWNER }));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), paths.user('super2')), { companyId: C1, role: 'supervisor', name: 'super2 user', email: 's2@x.com', siteIds: [S1] }));
    await assertFails(updateDoc(ref(as('super2'), 'x'), { priority: 'low' }));
    await assertFails(updateDoc(ref(as('super2'), 'x'), { assignedTo: 'super2', assignedToName: 'super2 user' }));
  });
  it('the assignee starts and resolves (with how it was fixed), but cannot close or re-prioritise', async () => {
    await seedIssue('y', { assignedTo: USERS.supervisor, assignedToName: 'supervisor user', createdBy: USERS.manager, createdByName: 'manager user' });
    const r = ref(sup(), 'y');
    await assertFails(updateDoc(r, { priority: 'low' }));
    await assertSucceeds(updateDoc(r, { status: 'in_progress', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(r, { status: 'resolved', resolvedBy: USERS.supervisor, resolvedByName: 'supervisor user' }));
    await assertFails(updateDoc(r, { status: 'resolved', resolution: 'Boards nailed', resolvedBy: USERS.owner, resolvedByName: 'owner user' }));
    await assertSucceeds(updateDoc(r, { status: 'resolved', resolution: 'Boards nailed down', resolvedBy: USERS.supervisor, resolvedByName: 'supervisor user', resolvedAt: serverTimestamp() }));
    await assertFails(updateDoc(r, { status: 'closed' }));
    await assertSucceeds(updateDoc(ref(asRole('manager'), 'y'), { status: 'closed' }));
    await assertSucceeds(updateDoc(ref(asRole('manager'), 'y'), { status: 'open' }));
  });
  it('the reporter fixes the details only while it is open', async () => {
    await seedIssue('z');
    await assertSucceeds(updateDoc(ref(sup(), 'z'), { title: 'Scaffold unsafe on level 2', photos: ['https://x/p.jpg'], photoCount: 1 }));
    await assertSucceeds(updateDoc(ref(sup(), 'z'), { thumbs: ['https://x/p-thumb.jpg'] }));
    await assertFails(updateDoc(ref(sup(), 'z'), { thumbs: Array(9).fill('x') }));
    await assertFails(updateDoc(ref(sup(), 'z'), { status: 'resolved', resolution: 'Fixed it myself', resolvedBy: USERS.supervisor, resolvedByName: 'supervisor user' }));
    await assertFails(updateDoc(ref(sup(), 'z'), { createdBy: USERS.owner }));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), paths.subDoc(C1, S1, 'issues', 'z')), { status: 'in_progress' }));
    await assertFails(updateDoc(ref(sup(), 'z'), { title: 'Changed later' }));
  });
  it('the site team comments; comments are permanent and honest; the count moves by one', async () => {
    await seedIssue('c1');
    const db = sup();
    const b = writeBatch(db);
    const c = doc(collection(db, paths.issueComments(C1, S1, 'c1')));
    b.set(c, { text: 'Boards delivered, fixing tomorrow', kind: 'comment', createdBy: USERS.supervisor, createdByName: 'supervisor user', createdAt: serverTimestamp() });
    b.update(ref(db, 'c1'), { commentCount: increment(1), lastActivityAt: serverTimestamp() });
    await assertSucceeds(b.commit());
    await assertFails(updateDoc(ref(db, 'c1'), { commentCount: increment(5) }));
    await assertFails(setDoc(doc(collection(db, paths.issueComments(C1, S1, 'c1'))), { text: 'Fake', kind: 'comment', createdBy: USERS.supervisor, createdByName: 'The Owner' }));
    await assertFails(updateDoc(doc(db, paths.issueComments(C1, S1, 'c1'), c.id), { text: 'Edited' }));
    await assertFails(deleteDoc(doc(asRole('owner'), paths.issueComments(C1, S1, 'c1'), c.id)));
    await assertFails(setDoc(doc(collection(asRole('viewer'), paths.issueComments(C1, S1, 'c1'))), { text: 'Hi', kind: 'comment', createdBy: USERS.viewer, createdByName: 'viewer user' }));
    await assertSucceeds(getDocs(collection(asRole('viewer'), paths.issueComments(C1, S1, 'c1'))));
  });
  it('issues are never deleted; closed sites take no new issues', async () => {
    await seedIssue('d1');
    await assertFails(deleteDoc(ref(asRole('owner'), 'd1')));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), paths.site(C1, S1)), { status: 'closed' }));
    await assertFails(setDoc(ref(sup(), 'late'), issue(USERS.supervisor)));
  });
  it('company-wide list for roles that see every site only', async () => {
    await seedIssue('g1');
    const q = (db: Firestore) => getDocs(query(collectionGroup(db, 'issues'), where('companyId', '==', C1), where('status', 'in', ['open', 'in_progress'])));
    await assertSucceeds(q(asRole('owner')));
    await assertSucceeds(q(asRole('finance')));
    await assertFails(q(sup()));
    await assertFails(q(as(OTHER_OWNER)));
  });
});

describe('milestones and progress', () => {
  const ms = (db: Firestore, id: string) => doc(db, paths.subDoc(C1, S1, 'milestones', id));
  const base = { name: 'Foundation', order: 1, weight: 1, plannedStart: '2026-01-01', plannedEnd: '2026-02-01', status: 'not_started', percentDone: 0, actualStart: null, actualEnd: null, note: '' };
  const seed = () => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), paths.subDoc(C1, S1, 'milestones', 'm1')), base));

  it('site managers set up milestones; the site team cannot', async () => {
    await assertSucceeds(setDoc(ms(asRole('manager'), 'a'), base));
    await assertFails(setDoc(ms(asRole('supervisor'), 'b'), base));
    await assertFails(setDoc(ms(asRole('manager'), 'c'), { ...base, plannedEnd: 'soon' }));
    await assertFails(setDoc(ms(asRole('manager'), 'd'), { ...base, status: 'done', percentDone: 50 }));
    await assertFails(setDoc(ms(asRole('manager'), 'e'), { ...base, weight: 0 }));
  });
  it('the site team updates progress with their name, nothing else', async () => {
    await seed();
    const sup = ms(asRole('supervisor'), 'm1');
    const step = { status: 'in_progress', percentDone: 40, actualStart: today, updatedBy: USERS.supervisor, updatedByName: 'supervisor user', updatedAt: serverTimestamp() };
    await assertSucceeds(updateDoc(sup, step));
    await assertFails(updateDoc(sup, { ...step, updatedByName: 'The Owner' }));
    await assertFails(updateDoc(sup, { ...step, plannedEnd: '2027-01-01' }));
    await assertFails(updateDoc(sup, { ...step, weight: 50 }));
    await assertFails(updateDoc(sup, { ...step, status: 'done', percentDone: 90 }));
    await assertFails(updateDoc(ms(asRole('viewer'), 'm1'), { ...step, updatedBy: USERS.viewer, updatedByName: 'viewer user' }));
    await assertFails(deleteDoc(sup));
    await assertSucceeds(deleteDoc(ms(asRole('manager'), 'm1')));
  });
  it('progress can be updated on a site that has no daily report yet', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), paths.site(C1, S1)), { lastReportDate: null }));
    await assertSucceeds(updateDoc(doc(asRole('supervisor'), paths.site(C1, S1)), { progress: 35 }));
  });
});

describe('notifications', () => {
  it('the owner chooses notification channels; others cannot', async () => {
    await assertSucceeds(updateDoc(doc(asRole('owner'), paths.company(C1)), { notifications: { critical_issue: { whatsapp: true, email: false } } }));
    await assertFails(updateDoc(doc(asRole('admin'), paths.company(C1)), { notifications: { critical_issue: { whatsapp: false, email: false } } }));
  });
  it('the message log is read by owners and admins only and written by nobody', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), paths.notifications(C1), 'n1'), { kind: 'critical_issue', channel: 'email', status: 'sent', to: '…4567' }));
    await assertSucceeds(getDocs(collection(asRole('owner'), paths.notifications(C1))));
    await assertSucceeds(getDocs(collection(asRole('admin'), paths.notifications(C1))));
    await assertFails(getDocs(collection(asRole('manager'), paths.notifications(C1))));
    await assertFails(getDocs(collection(asRole('supervisor'), paths.notifications(C1))));
    await assertFails(setDoc(doc(asRole('owner'), paths.notifications(C1), 'fake'), { kind: 'critical_issue', status: 'sent' }));
    await assertFails(getDocs(collection(as(OTHER_OWNER), paths.notifications(C1))));
  });
});
