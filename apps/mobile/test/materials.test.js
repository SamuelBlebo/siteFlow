// Material entries on mobile, with React Native Firebase mocked
import { beforeEach, describe, expect, it, vi } from 'vitest';

const commits = [];
let fail = null;
vi.mock('@react-native-firebase/firestore', () => {
  let n = 0;
  const ref = (path) => ({ path, id: path.split('/').pop() });
  const col = (p) => ({ doc: (id) => ref(`${p}/${id ?? `new${++n}`}`), where() { return this; }, orderBy() { return this; } });
  const fs = () => ({
    doc: ref, collection: col,
    batch: () => {
      const ops = [];
      return {
        set: (r, d) => ops.push(['set', r.path, d]),
        update: (r, d) => ops.push(['update', r.path, d]),
        commit: async () => { commits.push(ops); if (fail) throw fail; },
      };
    },
  });
  fs.FieldValue = { serverTimestamp: () => 'ts', increment: (x) => ({ inc: x }) };
  return { default: fs };
});
const store = new Map();
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async (k) => store.get(k) ?? null, setItem: async (k, v) => { store.set(k, v); } } }));
vi.mock('@react-native-community/netinfo', () => ({ default: { fetch: async () => ({ isConnected: true }), addEventListener: () => () => {} } }));

const db = await import('../src/lib/db');
const sync = await import('../src/lib/sync');
const material = { id: 'cement', name: 'Cement', unit: 'bags' };

beforeEach(() => { commits.length = 0; fail = null; for (const f of sync.getSyncState().failed) sync.dismiss(f.id); });

describe('material entries on mobile', () => {
  it('usage writes the entry with author name and note, and moves stock down in the same batch', async () => {
    await db.logMaterial('c1', 's1', { material, type: 'usage', qty: 6, note: 'Columns', uid: 'u1', name: 'Kofi Mensah', date: '2026-06-15' });
    const [[log, stock]] = commits;
    expect(log[0]).toBe('set');
    expect(log[2]).toMatchObject({ materialId: 'cement', type: 'usage', qty: 6, note: 'Columns', ref: '', cost: 0, createdBy: 'u1', createdByName: 'Kofi Mensah', date: '2026-06-15' });
    expect(stock).toEqual(['update', 'companies/c1/sites/s1/materials/cement', { stock: { inc: -6 }, lastLogId: log[1].split('/').pop() }]);
  });
  it('a delivery moves stock up and keeps supplier and waybill; no expense without a cost', async () => {
    await db.logMaterial('c1', 's1', { material, type: 'delivery', qty: 40, supplier: 'Ghacem', ref: 'WB-1', uid: 'u1', name: 'Kofi' });
    const [ops] = commits;
    expect(ops).toHaveLength(2);
    expect(ops[0][2]).toMatchObject({ supplier: 'Ghacem', ref: 'WB-1' });
    expect(ops[1][2].stock).toEqual({ inc: 40 });
  });
  it('a rejected entry is kept with its data for retry', async () => {
    fail = { code: 'firestore/permission-denied' };
    await db.logMaterial('c1', 's1', { material, type: 'usage', qty: 2, uid: 'u1', name: 'Kofi', date: '2026-06-15' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 0));
    expect(sync.getSyncState().failed[0]).toMatchObject({ op: 'logMaterial', args: ['c1', 's1', { material, type: 'usage', qty: 2, name: 'Kofi' }] });
  });
});
