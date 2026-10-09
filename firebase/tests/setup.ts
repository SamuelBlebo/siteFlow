// Shared test environment for the security-rule tests. Runs against the local emulators:
//   npm run test:rules   (starts the Firestore and Storage emulators, runs these tests, stops them)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, setLogLevel, type Firestore } from 'firebase/firestore';
import { paths, reportDoc, reportId, type Role } from '@siteflow/shared';

export const PROJECT_ID = 'demo-siteflow';
// Denied writes are expected in these tests; don't flood the output with SDK warnings
setLogLevel('silent');
export const C1 = 'c1';
export const C2 = 'c2';
export const S1 = 's1';   // supervisor and viewer are assigned here
export const S2 = 's2';   // no site-scoped user is assigned here
export const S9 = 's9';   // belongs to company c2

// One user per role in company c1, plus an owner of another company
export const USERS: Record<Role, string> = {
  owner: 'owner1', admin: 'admin1', manager: 'manager1', finance: 'finance1', supervisor: 'super1', viewer: 'viewer1',
};
export const OTHER_OWNER = 'owner2';
export const OFF_USER = 'off1';  // supervisor on s1, switched off
export const MULTI = 'multi1';   // one login in both companies: admin in c1, supervisor on s9 in c2
export const SEEDED_REPORT = reportId('2026-06-01', 'super1'); // by the supervisor, on every site

export async function makeEnv(): Promise<RulesTestEnvironment> {
  const [fsHost, fsPort] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  const [stHost, stPort] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199').split(':');
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'), host: fsHost, port: Number(fsPort) },
    storage: { rules: readFileSync(resolve(__dirname, '../storage.rules'), 'utf8'), host: stHost, port: Number(stPort) },
  });
}

export const site = (name: string) => ({
  name, location: 'Accra', stage: 'Foundation', progress: 10, status: 'active', lastReportDate: null,
});

// A person (users/{uid}) and their membership in each company (companies/{cid}/members/{uid})
type Seat = { role: Role; siteIds?: string[]; active?: boolean };
export async function putPerson(db: Firestore, uid: string, name: string, seats: Record<string, Seat>) {
  const ids = Object.keys(seats);
  const email = `${uid}@example.com`;
  await setDoc(doc(db, paths.user(uid)), { name, email, companyIds: ids, companyId: ids[0] });
  for (const [cid, s] of Object.entries(seats)) {
    await setDoc(doc(db, paths.member(cid, uid)), { name, email, role: s.role, siteIds: s.siteIds ?? [], ...(s.active === false ? { active: false } : {}) });
  }
}

export async function seed(env: RulesTestEnvironment) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (path: string, data: object) => setDoc(doc(db, path), data);
    await put(paths.company(C1), { name: 'Mensah Builders', ownerId: USERS.owner, plan: 'starter', modules: {} });
    await put(paths.company(C2), { name: 'Other Co', ownerId: OTHER_OWNER, plan: 'starter', modules: {} });
    for (const [role, uid] of Object.entries(USERS)) {
      const scoped = role === 'supervisor' || role === 'viewer';
      await putPerson(db as unknown as Firestore, uid, `${role} user`, { [C1]: { role: role as Role, siteIds: scoped ? [S1] : [] } });
    }
    await putPerson(db as unknown as Firestore, OFF_USER, 'Off user', { [C1]: { role: 'supervisor', siteIds: [S1], active: false } });
    await putPerson(db as unknown as Firestore, OTHER_OWNER, 'Other owner', { [C2]: { role: 'owner' } });
    await putPerson(db as unknown as Firestore, MULTI, 'Ebo Mensah', { [C1]: { role: 'admin' }, [C2]: { role: 'supervisor', siteIds: [S9] } });

    for (const [cid, sid] of [[C1, S1], [C1, S2], [C2, S9]]) {
      await put(paths.site(cid, sid), site(`Site ${sid}`));
      await put(paths.finance(cid, sid), { budget: 100000, spent: 1000 });
      await put(paths.subDoc(cid, sid, 'materials', 'cement'), { name: 'Cement', unit: 'bags', stock: 50, reorderLevel: 10, avgDaily: 5 });
      await put(paths.subDoc(cid, sid, 'workers', 'w1'), { name: 'Yaw Boateng', trade: 'Mason', active: true, createdBy: USERS.owner });
      await put(paths.workerPay(cid, sid, 'w1'), { dailyRate: 150 });
      await put(paths.subDoc(cid, sid, 'expenses', 'e1'), { date: '2026-06-01', category: 'Materials', note: '', amount: 1000, createdBy: USERS.owner });
      await put(paths.subDoc(cid, sid, 'reports', SEEDED_REPORT), reportDoc(
        { text: 'Work', stage: 'Foundation', progress: 10, workersPresent: 3 },
        { companyId: cid, siteId: sid, siteName: `Site ${sid}`, date: '2026-06-01', time: '17:00', uid: USERS.supervisor, name: 'supervisor user', source: 'app' },
      ));
      await put(paths.subDoc(cid, sid, 'billing', 'b1'), { name: 'Stage 1', amount: 5000, status: 'upcoming', order: 1 });
    }
  });
}
