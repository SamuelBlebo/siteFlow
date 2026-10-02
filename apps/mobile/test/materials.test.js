// Material entries on mobile, with React Native Firebase mocked
import { beforeEach, describe, expect, it, vi } from 'vitest';

const commits = [];
const server = new Map(); // what the server holds, for the journal's checks
let fail = null;
vi.mock('@react-native-firebase/firestore', () => {
  let n = 0;
  const ref = (path) => ({
    path, id: path.split('/').pop(),
    get: async (opts) => { if (opts?.source !== 'server') throw new Error('checks must read the server'); const d = server.get(path); return { exists: () => !!d, data: () => d }; },
  });
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

beforeEach(() => { commits.length = 0; server.clear(); fail = null; for (const f of sync.getSyncState().failed) sync.dismiss(f.id); });

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

describe('issue changes on mobile', () => {
  it('resolving writes the change, the resolved time and a timeline note in one batch', async () => {
    await db.updateIssue('c1', 's1', { id: 'i1', patch: { status: 'resolved', resolution: 'Pipe fixed', resolvedBy: 'u1', resolvedByName: 'Kofi' }, note: 'marked it resolved', uid: 'u1', name: 'Kofi' });
    const [[upd, note]] = commits;
    expect(upd).toEqual(['update', 'companies/c1/sites/s1/issues/i1', expect.objectContaining({ status: 'resolved', resolution: 'Pipe fixed', resolvedAt: 'ts', lastActivityAt: 'ts' })]);
    expect(note[1]).toMatch(/^companies\/c1\/sites\/s1\/issues\/i1\/comments\//);
    expect(note[2]).toMatchObject({ text: 'marked it resolved', kind: 'update', createdByName: 'Kofi' });
  });
  it('a refused change explains that someone may have changed the issue first', async () => {
    fail = { code: 'firestore/permission-denied' };
    await db.updateIssue('c1', 's1', { id: 'i1', patch: { status: 'in_progress' }, uid: 'u1', name: 'Kofi' }).catch(() => {});
    expect(sync.getSyncState().failed[0].message).toMatch(/Someone else may have changed this issue/);
  });
  it('a comment adds one to the count', async () => {
    await db.addComment('c1', 's1', { id: 'i1', text: 'Plumber on the way', uid: 'u1', name: 'Kofi' });
    const [[c, upd]] = commits;
    expect(c[2]).toMatchObject({ text: 'Plumber on the way', kind: 'comment' });
    expect(upd[2]).toMatchObject({ commentCount: { inc: 1 } });
  });
});

describe('costed delivery on mobile', () => {
  it('records the expense with its author and leaves the totals to the server', async () => {
    await db.logMaterial('c1', 's1', { material, type: 'delivery', qty: 10, cost: 900, supplier: 'Ghacem', ref: 'WB-9', uid: 'u1', name: 'Efua', date: '2026-06-15' });
    const [ops] = commits;
    expect(ops.map((o) => o[1].split('/').slice(-2, -1)[0])).toEqual(['materialLogs', 'materials', 'expenses']);
    expect(ops[2][2]).toMatchObject({ category: 'Materials', amount: 900, payee: 'Ghacem', ref: 'WB-9', createdByName: 'Efua' });
    expect(ops.some((o) => o[1].endsWith('finance/summary'))).toBe(false);
  });
});

describe('milestone progress on mobile', () => {
  it('sets the milestone, its status and dates, and the site overall in one batch', async () => {
    const all = [{ id: 'm1', name: 'Foundation', weight: 1, percentDone: 100 }, { id: 'm2', name: 'Blockwork', weight: 1, percentDone: 0 }];
    await db.setMilestoneProgress('c1', 's1', { milestone: all[1], all, percentDone: 50, uid: 'u1', name: 'Kofi', today: '2026-06-15' });
    const [[ms, site]] = commits;
    expect(ms).toEqual(['update', 'companies/c1/sites/s1/milestones/m2', expect.objectContaining({
      percentDone: 50, status: 'in_progress', actualStart: '2026-06-15', actualEnd: null, updatedBy: 'u1', updatedByName: 'Kofi',
    })]);
    expect(site).toEqual(['update', 'companies/c1/sites/s1', { progress: 75 }]);
  });
});

describe('fixed ids and server checks', () => {
  it('an entry keeps its id in the journal, so sending it again writes the same records', async () => {
    fail = { code: 'firestore/permission-denied' };
    await db.logMaterial('c1', 's1', { material, type: 'delivery', qty: 10, cost: 500, uid: 'u1', name: 'Efua', date: '2026-06-15' }).catch(() => {});
    const failed = sync.getSyncState().failed[0];
    const logId = failed.args[2].logId;
    expect(logId).toBeTruthy();
    fail = null;
    await db.logMaterial(...failed.args);
    const [first, second] = commits;
    expect(second.map((o) => o[1])).toEqual(first.map((o) => o[1]));
    expect(second[0][1]).toBe(`companies/c1/sites/s1/materialLogs/${logId}`);
    expect(second[2][1]).toBe(`companies/c1/sites/s1/expenses/${logId}-cost`);
  });

  it('try again does not send an entry the server already has', async () => {
    fail = { code: 'firestore/permission-denied' };
    await db.logMaterial('c1', 's1', { material, type: 'usage', qty: 3, uid: 'u1', name: 'Kofi', date: '2026-06-15' }).catch(() => {});
    const f = sync.getSyncState().failed[0];
    server.set(`companies/c1/sites/s1/materialLogs/${f.args[2].logId}`, { qty: 3 });
    fail = null;
    await sync.retry(f.id);
    expect(commits).toHaveLength(1); // only the first attempt
    expect(sync.getSyncState().failed).toHaveLength(0);
  });

  it('try again sends a comment the server does not have, under the same id', async () => {
    fail = { code: 'firestore/unauthenticated' };
    await db.addComment('c1', 's1', { id: 'i1', text: 'On my way', uid: 'u1', name: 'Kofi' }).catch(() => {});
    const f = sync.getSyncState().failed[0];
    fail = null;
    await sync.retry(f.id);
    expect(commits).toHaveLength(2);
    expect(commits[1][0][1]).toBe(`companies/c1/sites/s1/issues/i1/comments/${f.args[2].commentId}`);
  });
});
