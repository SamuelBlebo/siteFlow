// After a restart or a dropped connection, each kind of change is checked on the server:
// there -> cleared; not there -> "not saved" with Try again. Runs through the real journal.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const server = new Map();
const store = new Map();
vi.mock('@react-native-firebase/firestore', () => {
  let n = 0;
  const ref = (path) => ({
    path, id: path.split('/').pop(),
    get: async (opts) => {
      if (opts?.source !== 'server') throw new Error('checks must read the server');
      const d = server.get(path);
      return { exists: () => !!d, data: () => d };
    },
    set: async () => { throw { code: 'firestore/unavailable' }; },
    update: async () => { throw { code: 'firestore/unavailable' }; },
  });
  const fs = () => ({
    doc: ref,
    collection: (p) => ({ doc: (id) => ref(`${p}/${id ?? `new${++n}`}`), where() { return this; }, orderBy() { return this; } }),
    batch: () => ({ set() {}, update() {}, commit: async () => { throw { code: 'firestore/unavailable' }; } }),
    waitForPendingWrites: async () => {},
  });
  fs.FieldValue = { serverTimestamp: () => 'ts', increment: (x) => ({ inc: x }) };
  return { default: fs };
});
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async (k) => store.get(k) ?? null, setItem: async (k, v) => { store.set(k, v); }, removeItem: async (k) => { store.delete(k); } },
}));
vi.mock('@react-native-community/netinfo', () => ({ default: { fetch: async () => ({ isConnected: true }), addEventListener: () => () => {} } }));
vi.mock('@react-native-firebase/auth', () => ({ default: () => ({ currentUser: { uid: 'u1' } }) }));

const db = await import('../src/lib/db');
const { updateMyProfile } = await import('../src/lib/account');
const sync = await import('../src/lib/sync');
const C = 'companies/c1/sites/s1';

// Every write here hits "no signal", so it stays waiting in the journal until reconcile checks it
async function waiting(write) {
  await write().catch(() => {});
  const [e] = sync.getJournal().filter((x) => x.status === 'pending');
  return e;
}
const settled = (e) => sync.getJournal().find((x) => x.id === e.id);

beforeEach(async () => {
  server.clear();
  for (const e of [...sync.getJournal()]) await sync.dismiss(e.id);
});

describe('server checks for each kind of change', () => {
  it('attendance: arrived only if every mark matches', async () => {
    const e = await waiting(() => db.markAttendance('c1', 's1', { marks: { w1: 'present', w2: 'late' }, uid: 'u1', date: '2026-06-15' }));
    server.set(`${C}/attendance/2026-06-15`, { marks: { w1: 'present', w2: 'absent' } });
    await sync.reconcile();
    // Marked differently since: say so, rather than invite resending an older mark
    expect(settled(e)).toMatchObject({ status: 'failed' });
    expect(settled(e).message).toMatch(/different attendance mark/);

    const e2 = await waiting(() => db.markAttendance('c1', 's1', { marks: { w1: 'present' }, uid: 'u1', date: '2026-06-15' }));
    await sync.reconcile();
    expect(settled(e2)).toBeUndefined();
  });

  it('attendance never sent at all: plain "did not reach the office"', async () => {
    const e = await waiting(() => db.markAttendance('c1', 's1', { marks: { w9: 'present' }, uid: 'u1', date: '2026-06-16' }));
    server.set(`${C}/attendance/2026-06-16`, { marks: { w1: 'present' } });
    await sync.reconcile();
    expect(settled(e).message).toMatch(/did not reach the office/);
  });

  it('new worker: arrived if the worker exists under the id made on the phone', async () => {
    const e = await waiting(() => db.addWorker('c1', 's1', { name: 'Ama', trade: 'Mason', uid: 'u1' }));
    server.set(`${C}/workers/${e.args[2].workerId}`, { name: 'Ama' });
    await sync.reconcile();
    expect(settled(e)).toBeUndefined();
  });

  it('worker details: arrived if name, trade and phone match', async () => {
    const e = await waiting(() => db.updateWorker('c1', 's1', { id: 'w1', name: 'Yaw', trade: 'Carpenter', phone: '' }));
    server.set(`${C}/workers/w1`, { name: 'Yaw', trade: 'Mason', phone: '' });
    await sync.reconcile();
    expect(settled(e)).toMatchObject({ status: 'failed' });
    expect(settled(e).message).toMatch(/different record for this worker/);
  });

  it('issue change: by its timeline note if it has one, else by the changed fields', async () => {
    const withNote = await waiting(() => db.updateIssue('c1', 's1', { id: 'i1', patch: { status: 'in_progress' }, note: 'started', uid: 'u1', name: 'Kofi' }));
    server.set(`${C}/issues/i1/comments/${withNote.args[2].noteId}`, { text: 'started' });
    await sync.reconcile();
    expect(settled(withNote)).toBeUndefined();

    const plain = await waiting(() => db.updateIssue('c1', 's1', { id: 'i2', patch: { priority: 'high' }, uid: 'u1', name: 'Kofi' }));
    server.set(`${C}/issues/i2`, { priority: 'high', title: 'Leak' });
    await sync.reconcile();
    expect(settled(plain)).toBeUndefined();
  });

  it('milestone progress: arrived if the percentage matches', async () => {
    const m = { id: 'm1', name: 'Roof', percentDone: 0 };
    const e = await waiting(() => db.setMilestoneProgress('c1', 's1', { milestone: m, all: [m], percentDone: 50, uid: 'u1', name: 'Kofi', today: '2026-06-15' }));
    server.set(`${C}/milestones/m1`, { percentDone: 25 });
    await sync.reconcile();
    expect(settled(e)).toMatchObject({ status: 'failed' });
    expect(settled(e).message).toMatch(/different progress for Roof/);
  });

  it('your details: arrived if name and phone match', async () => {
    const e = await waiting(() => updateMyProfile('u1', { name: 'Kofi Asante', phone: '0241234567' }));
    server.set('users/u1', { name: 'Kofi Asante', phone: '0241234567' });
    await sync.reconcile();
    expect(settled(e)).toBeUndefined();
  });
});
