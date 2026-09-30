import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { PERMISSIONS, ROLES, can, paths, type Permission, type Role } from '@siteflow/shared';
import { C1, C2, OFF_USER, OTHER_OWNER, S1, S2, S9, USERS, makeEnv, seed, site } from './setup';

let env: RulesTestEnvironment;
beforeAll(async () => { env = await makeEnv(); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await seed(env); });

const as = (uid: string): Firestore => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const asRole = (r: Role) => as(USERS[r]);
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
const today = '2026-06-15';

const report = (uid: string, name: string, extra: object = {}) => ({
  date: today, time: '17:00', text: 'Cast lintels', stage: 'Blockwork', progress: 30, issues: '', photos: [],
  workersPresent: 4, createdBy: uid, createdByName: name, createdAt: serverTimestamp(), ...extra,
});

// Writes a material log and the matching stock change in one batch, the way the apps do
function logMaterial(db: Firestore, cid: string, sid: string, uid: string, o: { type?: 'usage' | 'delivery'; qty?: number; cost?: number; stockChange?: number } = {}) {
  const type = o.type ?? 'usage';
  const qty = o.qty ?? 5;
  const logRef = doc(collection(db, paths.sub(cid, sid, 'materialLogs')));
  const b = writeBatch(db);
  b.set(logRef, {
    materialId: 'cement', materialName: 'Cement', unit: 'bags', type, qty, cost: o.cost ?? 0, supplier: '',
    date: today, createdBy: uid, createdAt: serverTimestamp(),
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
const probes: Record<Permission, (db: Firestore, r: Role) => Promise<unknown>> = {
  'company.settings': (db) => updateDoc(doc(db, paths.company(C1)), { name: 'Renamed Builders' }),
  // reading someone else's profile (never your own)
  'team.manage': (db, r) => getDoc(doc(db, paths.user(r === 'supervisor' ? USERS.viewer : USERS.supervisor))),
  'sites.all': (db) => getDoc(doc(db, paths.site(C1, S2))),
  'sites.manage': (db) => setDoc(doc(db, paths.site(C1, 'new-site')), site('New site')),
  'site.work': (db, r) => setDoc(doc(db, paths.subDoc(C1, S1, 'reports', `probe-${r}`)), report(USERS[r], `${r} user`)),
  'finance.view': (db) => getDoc(doc(db, paths.finance(C1, S1))),
  'finance.edit': (db, r) => setDoc(doc(db, paths.subDoc(C1, S1, 'expenses', `probe-${r}`)), {
    date: today, category: 'Transport', note: '', amount: 200, createdBy: USERS[r], createdAt: serverTimestamp(),
  }),
  'audit.view': (db) => getDocs(collection(db, paths.activity(C1))),
};

describe('rules match the shared permission table', () => {
  for (const perm of Object.keys(PERMISSIONS) as Permission[]) {
    for (const role of ROLES) {
      const allowed = can(role, perm);
      it(`${role} ${allowed ? 'can' : 'cannot'} ${perm}`, async () => {
        const run = probes[perm](asRole(role), role);
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
      await assertFails(setDoc(doc(db, paths.subDoc(C2, S9, 'reports', 'x')), report(USERS[role], `${role} user`)));
      await assertFails(getDoc(doc(db, paths.user(OTHER_OWNER))));
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
    await assertFails(getDocs(query(collection(asRole('manager'), 'users'), where('companyId', '==', C1))));
  });
  it('nobody changes their own role', async () => {
    await assertFails(updateDoc(doc(asRole('supervisor'), paths.user(USERS.supervisor)), { role: 'manager' }));
    await assertFails(updateDoc(doc(asRole('admin'), paths.user(USERS.admin)), { role: 'owner' }));
    await assertFails(updateDoc(doc(asRole('supervisor'), paths.user(USERS.supervisor)), { siteIds: [S1, S2] }));
    await assertFails(updateDoc(doc(asRole('supervisor'), paths.user(USERS.supervisor)), { companyId: C2 }));
  });
  it('only the owner makes admins; nobody makes owners', async () => {
    await assertFails(updateDoc(doc(asRole('admin'), paths.user(USERS.viewer)), { role: 'admin' }));
    await assertFails(updateDoc(doc(asRole('owner'), paths.user(USERS.viewer)), { role: 'owner' }));
    await assertSucceeds(updateDoc(doc(asRole('owner'), paths.user(USERS.viewer)), { role: 'admin' }));
  });
  it('admins cannot change other admins or the owner', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), paths.user('admin2')), { companyId: C1, role: 'admin', name: 'A2', email: 'a2@x.com', siteIds: [] }));
    await assertFails(updateDoc(doc(asRole('admin'), paths.user('admin2')), { role: 'viewer' }));
    await assertFails(updateDoc(doc(asRole('admin'), paths.user(USERS.owner)), { siteIds: [S1] }));
  });
  it('admins assign sites and switch people off', async () => {
    await assertSucceeds(updateDoc(doc(asRole('admin'), paths.user(USERS.supervisor)), { siteIds: [S1, S2] }));
    await assertSucceeds(updateDoc(doc(asRole('admin'), paths.user(USERS.viewer)), { active: false }));
    await assertFails(updateDoc(doc(asRole('admin'), paths.user(USERS.viewer)), { email: 'hijack@x.com' }));
    await assertFails(updateDoc(doc(asRole('manager'), paths.user(USERS.supervisor)), { siteIds: [S1, S2] }));
  });
});

describe('company', () => {
  it('nobody creates companies or changes plan and modules from the client', async () => {
    await assertFails(setDoc(doc(as('newbie'), paths.company('newbie')), { name: 'Free Co', ownerId: 'newbie', plan: 'enterprise', modules: {} }));
    await assertFails(updateDoc(doc(asRole('owner'), paths.company(C1)), { plan: 'enterprise' }));
    await assertFails(updateDoc(doc(asRole('owner'), paths.company(C1)), { modules: { portal: true } }));
    await assertFails(updateDoc(doc(asRole('admin'), paths.company(C1)), { name: 'Admin Renamed' }));
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

describe('finance', () => {
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
    await assertFails(setDoc(doc(db, paths.workerPay(C1, S1, 'w1')), { dailyRate: 999 }));
    await assertFails(setDoc(doc(db, paths.subDoc(C1, S1, 'expenses', 'x')), { date: today, category: 'Other', note: '', amount: 5, createdBy: USERS.supervisor }));
  });
  it('finance records spending but cannot change the budget', async () => {
    const db = asRole('finance');
    await assertSucceeds(updateDoc(doc(db, paths.finance(C1, S1)), { spent: increment(200) }));
    await assertFails(updateDoc(doc(db, paths.finance(C1, S1)), { budget: 1 }));
    await assertSucceeds(updateDoc(doc(asRole('manager'), paths.finance(C1, S1)), { budget: 200000 }));
    await assertFails(updateDoc(doc(db, paths.finance(C1, S1)), { spent: -5 }));
    await assertSucceeds(setDoc(doc(db, paths.workerPay(C1, S1, 'w1')), { dailyRate: 180, bankName: 'GCB', accountLast4: '1234' }));
  });
  it('new sites start with nothing spent', async () => {
    await assertFails(setDoc(doc(asRole('manager'), paths.finance(C1, 'new')), { budget: 10, spent: 5 }));
    await assertSucceeds(setDoc(doc(asRole('manager'), paths.finance(C1, 'new')), { budget: 10, spent: 0 }));
    await assertFails(setDoc(doc(asRole('finance'), paths.finance(C1, 'new2')), { budget: 10, spent: 0 }));
  });
});

describe('materials', () => {
  it('supervisor logs usage and stock moves by exactly that amount', async () => {
    await assertSucceeds(logMaterial(asRole('supervisor'), C1, S1, USERS.supervisor, { qty: 5 }));
    await assertSucceeds(logMaterial(asRole('supervisor'), C1, S1, USERS.supervisor, { type: 'delivery', qty: 20 }));
  });
  it('stock cannot be set directly or moved by the wrong amount', async () => {
    const db = asRole('supervisor');
    await assertFails(updateDoc(doc(db, paths.subDoc(C1, S1, 'materials', 'cement')), { stock: 9999 }));
    await assertFails(logMaterial(db, C1, S1, USERS.supervisor, { qty: 5, stockChange: +50 }));
    await assertFails(logMaterial(db, C1, S1, 'someone-else', { qty: 5 }));
  });
  it('a log cannot be written without its stock change', async () => {
    await assertFails(setDoc(doc(asRole('supervisor'), paths.subDoc(C1, S1, 'materialLogs', 'lonely')), {
      materialId: 'cement', materialName: 'Cement', unit: 'bags', type: 'usage', qty: 1, cost: 0, supplier: '',
      date: today, createdBy: USERS.supervisor,
    }));
  });
  it('only finance roles record a delivery cost', async () => {
    await assertFails(logMaterial(asRole('supervisor'), C1, S1, USERS.supervisor, { type: 'delivery', qty: 10, cost: 500 }));
    await assertSucceeds(logMaterial(asRole('manager'), C1, S1, USERS.manager, { type: 'delivery', qty: 10, cost: 500 }));
  });
  it('viewer cannot log and supervisor cannot log on other sites', async () => {
    await assertFails(logMaterial(asRole('viewer'), C1, S1, USERS.viewer));
    await assertFails(logMaterial(asRole('supervisor'), C1, S2, USERS.supervisor));
  });
  it('only site managers set up materials', async () => {
    const m = { name: 'Sand', unit: 'trips', stock: 0, reorderLevel: 1, avgDaily: 1 };
    await assertFails(setDoc(doc(asRole('supervisor'), paths.subDoc(C1, S1, 'materials', 'sand')), m));
    await assertSucceeds(setDoc(doc(asRole('manager'), paths.subDoc(C1, S1, 'materials', 'sand')), m));
  });
});

describe('workers and attendance', () => {
  it('supervisor adds workers but cannot put pay on them', async () => {
    const db = asRole('supervisor');
    const w = { name: 'Ama Owusu', trade: 'Labourer', active: true, createdBy: USERS.supervisor, createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db, paths.subDoc(C1, S1, 'workers', 'w2')), w));
    await assertFails(setDoc(doc(db, paths.subDoc(C1, S1, 'workers', 'w3')), { ...w, dailyRate: 150 }));
    await assertFails(updateDoc(doc(db, paths.subDoc(C1, S1, 'workers', 'w1')), { active: false }));
  });
  it('attendance marks merge per worker and carry no money', async () => {
    const db = asRole('supervisor');
    const ref = doc(db, paths.attendance(C1, S1, today));
    await assertSucceeds(setDoc(ref, { date: today, present: { w1: true }, markedBy: USERS.supervisor, updatedAt: serverTimestamp() }, { merge: true }));
    await assertSucceeds(setDoc(ref, { date: today, present: { w2: true }, markedBy: USERS.supervisor }, { merge: true }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      const s = await getDoc(doc(ctx.firestore(), paths.attendance(C1, S1, today)));
      expect(s.data()?.present).toEqual({ w1: true, w2: true });
    });
    await assertFails(setDoc(ref, { date: today, present: { w1: true }, markedBy: USERS.supervisor, wages: 150 }, { merge: true }));
    await assertFails(setDoc(ref, { date: today, present: { w1: true }, markedBy: USERS.owner }, { merge: true }));
    await assertFails(setDoc(doc(db, paths.attendance(C1, S1, '2026-06-16')), { date: today, present: {}, markedBy: USERS.supervisor }));
    await assertFails(setDoc(doc(asRole('viewer'), paths.attendance(C1, S1, today)), { date: today, present: {}, markedBy: USERS.viewer }));
  });
});

describe('reports', () => {
  it('supervisor sends a report on an assigned site', async () => {
    await assertSucceeds(setDoc(doc(asRole('supervisor'), paths.subDoc(C1, S1, 'reports', 'new')), report(USERS.supervisor, 'supervisor user')));
  });
  it('cannot fake the author, send elsewhere or send junk', async () => {
    const db = asRole('supervisor');
    await assertFails(setDoc(doc(db, paths.subDoc(C1, S1, 'reports', 'a')), report(USERS.owner, 'owner user')));
    await assertFails(setDoc(doc(db, paths.subDoc(C1, S1, 'reports', 'b')), report(USERS.supervisor, 'The Owner')));
    await assertFails(setDoc(doc(db, paths.subDoc(C1, S2, 'reports', 'c')), report(USERS.supervisor, 'supervisor user')));
    await assertFails(setDoc(doc(db, paths.subDoc(C1, S1, 'reports', 'd')), report(USERS.supervisor, 'supervisor user', { progress: 150 })));
    await assertFails(setDoc(doc(db, paths.subDoc(C1, S1, 'reports', 'e')), report(USERS.supervisor, 'supervisor user', { photos: Array(9).fill('x') })));
    await assertFails(setDoc(doc(db, paths.subDoc(C1, S1, 'reports', 'f')), report(USERS.supervisor, 'supervisor user', { spent: 1 })));
  });
  it('the author adds photo links only', async () => {
    const db = asRole('supervisor');
    await assertSucceeds(updateDoc(doc(db, paths.subDoc(C1, S1, 'reports', 'r1')), { photos: ['https://example.com/a.jpg'] }));
    await assertFails(updateDoc(doc(db, paths.subDoc(C1, S1, 'reports', 'r1')), { text: 'Rewritten' }));
    await assertFails(deleteDoc(doc(db, paths.subDoc(C1, S1, 'reports', 'r1'))));
  });
  it('viewer reads but cannot write', async () => {
    await assertSucceeds(getDocs(collection(asRole('viewer'), paths.sub(C1, S1, 'reports'))));
    await assertFails(setDoc(doc(asRole('viewer'), paths.subDoc(C1, S1, 'reports', 'v')), report(USERS.viewer, 'viewer user')));
  });
});
