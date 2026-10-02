// Attendance and worker writes on mobile, with React Native Firebase mocked
import { beforeEach, describe, expect, it, vi } from 'vitest';

const writes = [];
let fail = null;
vi.mock('@react-native-firebase/firestore', () => {
  const ref = (path) => ({
    path, id: path.split('/').pop(),
    set: async (data, opts) => { writes.push(['set', path, data, opts]); if (fail) throw fail; },
    update: async (data) => { writes.push(['update', path, data]); if (fail) throw fail; },
  });
  const fs = () => ({ doc: ref, collection: (p) => ({ doc: (id = 'new') => ref(`${p}/${id}`), where() { return this; }, orderBy() { return this; } }), batch: () => ({ set() {}, update() {}, commit: async () => {} }) });
  fs.FieldValue = { serverTimestamp: () => 'ts', increment: (n) => ({ inc: n }) };
  return { default: fs };
});
const store = new Map();
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async (k) => store.get(k) ?? null, setItem: async (k, v) => { store.set(k, v); } } }));
vi.mock('@react-native-community/netinfo', () => ({ default: { fetch: async () => ({ isConnected: true }), addEventListener: () => () => {} } }));

const db = await import('../src/lib/db');
const sync = await import('../src/lib/sync');
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { writes.length = 0; fail = null; for (const f of sync.getSyncState().failed) sync.dismiss(f.id); });

describe('attendance on mobile', () => {
  it('marks merge per worker on the day document', async () => {
    await db.markAttendance('c1', 's1', { marks: { w1: 'late' }, uid: 'u1', date: '2026-06-15' });
    expect(writes[0]).toEqual(['set', 'companies/c1/sites/s1/attendance/2026-06-15',
      { date: '2026-06-15', marks: { w1: 'late' }, markedBy: 'u1', updatedAt: 'ts' }, { merge: true }]);
  });
  it('a rejected mark is kept with its data for retry', async () => {
    fail = { code: 'firestore/permission-denied' };
    await db.markAttendance('c1', 's1', { marks: { w1: 'present', w2: 'present' }, label: 'Attendance', uid: 'u1', date: '2026-06-15' }).catch(() => {});
    await tick();
    expect(sync.getSyncState().failed[0]).toMatchObject({ label: 'Attendance', op: 'markAttendance', args: ['c1', 's1', { marks: { w1: 'present', w2: 'present' }, date: '2026-06-15' }] });
  });
  it('the site team fixes a worker without touching pay or active', async () => {
    await db.updateWorker('c1', 's1', { id: 'w1', name: 'Yaw Boateng', trade: 'Mason', phone: '0241234567' });
    expect(writes[0]).toEqual(['update', 'companies/c1/sites/s1/workers/w1', { name: 'Yaw Boateng', trade: 'Mason', phone: '0241234567', updatedAt: 'ts' }]);
  });
});
