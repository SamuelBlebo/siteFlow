// The write journal (sync.js): nothing saved on the phone is lost or recorded twice.
// Native modules are mocked; each "app start" is a fresh import of the module with the same storage.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'siteflow:journal';
const store = new Map();
const netListeners = new Set();
const fsState = { pendingWrites: Promise.resolve() };
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => { store.set(k, v); },
    removeItem: async (k) => { store.delete(k); },
  },
}));
vi.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: async () => ({ isConnected: true, isInternetReachable: true }),
    addEventListener: (fn) => { netListeners.add(fn); return () => netListeners.delete(fn); },
  },
}));
vi.mock('@react-native-firebase/firestore', () => ({ default: () => ({ waitForPendingWrites: () => fsState.pendingWrites }) }));

const tick = () => new Promise((r) => setTimeout(r, 0));
const saved = () => JSON.parse(store.get(KEY) || '[]');
// A fresh copy of the module, as after closing and reopening the app
async function appStart() {
  vi.resetModules();
  return import('../src/lib/sync');
}
const denied = () => Object.assign(new Error('7 PERMISSION_DENIED'), { code: 'firestore/permission-denied' });
const offline = () => Object.assign(new Error('unavailable'), { code: 'firestore/unavailable' });
const entry = (over) => ({ id: 'e1', label: 'Cement used (5 bags)', op: 'logMaterial', args: ['c1', 's1', { logId: 'L1', qty: 5 }], status: 'pending', at: 1, ...over });

beforeEach(() => { store.clear(); netListeners.clear(); fsState.pendingWrites = Promise.resolve(); });

describe('recording a change', () => {
  it('is saved on the phone before it is sent', async () => {
    const sync = await appStart();
    let seen;
    await sync.journaled({ label: 'New worker Ama', op: 'addWorker', args: ['c1', 's1', { workerId: 'w9' }] }, async () => { seen = saved(); });
    expect(seen).toEqual([expect.objectContaining({ label: 'New worker Ama', op: 'addWorker', args: ['c1', 's1', { workerId: 'w9' }], status: 'pending' })]);
  });

  it('leaves the journal once the server confirms it', async () => {
    const sync = await appStart();
    await sync.journaled({ label: 'x', op: 'addWorker', args: [] }, async () => 'ok');
    expect(saved()).toEqual([]);
    expect(sync.getSyncState()).toMatchObject({ pending: 0, failed: [] });
    expect(sync.getSyncState().lastSyncedAt).toBeGreaterThan(0);
  });

  it('counts as waiting while it is on its way', async () => {
    const sync = await appStart();
    let done;
    const p = sync.journaled({ label: 'x', op: 'x', args: [] }, () => new Promise((r) => { done = r; }));
    await tick(); await tick();
    expect(sync.getSyncState().pending).toBe(1);
    done();
    await p;
    expect(sync.getSyncState().pending).toBe(0);
  });

  it('a refusal is kept as failed, with its data and a plain message, and survives a restart', async () => {
    let sync = await appStart();
    await expect(sync.journaled({ label: 'Cement used', op: 'logMaterial', args: ['c1', 's1', { qty: 5 }] }, async () => { throw denied(); })).rejects.toBeTruthy();
    const [f] = sync.getSyncState().failed;
    expect(f).toMatchObject({ label: 'Cement used', op: 'logMaterial', args: ['c1', 's1', { qty: 5 }], status: 'failed' });
    expect(f.message).toMatch(/permission/i);
    expect(f.message).not.toMatch(/PERMISSION_DENIED/);
    sync = await appStart();
    await sync.reconcile();
    expect(sync.getSyncState().failed).toHaveLength(1);
  });

  it('a connection problem stays waiting, not failed', async () => {
    const sync = await appStart();
    await sync.journaled({ label: 'x', op: 'x', args: [] }, async () => { throw offline(); }).catch(() => {});
    expect(sync.getSyncState()).toMatchObject({ pending: 1, failed: [] });
  });
});

describe('after the app is reopened', () => {
  it('a change the server has is cleared', async () => {
    store.set(KEY, JSON.stringify([entry()]));
    const sync = await appStart();
    const check = vi.fn(async () => true);
    sync.registerChecks({ logMaterial: check });
    await sync.reconcile();
    expect(check).toHaveBeenCalledWith('c1', 's1', { logId: 'L1', qty: 5 });
    expect(saved()).toEqual([]);
  });

  it('a change the server does not have shows as failed with Try again', async () => {
    store.set(KEY, JSON.stringify([entry()]));
    const sync = await appStart();
    sync.registerChecks({ logMaterial: async () => false });
    await sync.reconcile();
    expect(sync.getSyncState().failed[0]).toMatchObject({ id: 'e1', status: 'failed' });
    expect(sync.getSyncState().failed[0].message).toMatch(/did not reach the office/);
  });

  it('if the server cannot be reached, it is left waiting for later', async () => {
    store.set(KEY, JSON.stringify([entry()]));
    const sync = await appStart();
    sync.registerChecks({ logMaterial: async () => { throw offline(); } });
    await sync.reconcile();
    expect(sync.getSyncState()).toMatchObject({ pending: 1, failed: [] });
  });

  it('waits for Firestore to finish sending before checking', async () => {
    store.set(KEY, JSON.stringify([entry()]));
    let flush;
    fsState.pendingWrites = new Promise((r) => { flush = r; });
    const sync = await appStart();
    const check = vi.fn(async () => true);
    sync.registerChecks({ logMaterial: check });
    const run = sync.reconcile();
    await tick(); await tick();
    expect(check).not.toHaveBeenCalled();
    expect(sync.getSyncState().syncing).toBe(true);
    flush();
    await run;
    expect(check).toHaveBeenCalledTimes(1);
    expect(sync.getSyncState().syncing).toBe(false);
  });

  it('a change still being sent in this session is not checked or failed early', async () => {
    const sync = await appStart();
    sync.registerChecks({ x: async () => false });
    let done;
    const p = sync.journaled({ label: 'x', op: 'x', args: [] }, () => new Promise((r) => { done = r; }));
    await tick(); await tick();
    await sync.reconcile();
    expect(sync.getSyncState()).toMatchObject({ pending: 1, failed: [] });
    done();
    await p;
    expect(saved()).toEqual([]);
  });

  it('failures kept by the older tracker carry over', async () => {
    store.set('siteflow:failedWrites', JSON.stringify([{ id: 'old', label: 'Old', op: 'x', args: [], message: 'No' }]));
    const sync = await appStart();
    await sync.reconcile();
    expect(sync.getSyncState().failed).toEqual([expect.objectContaining({ id: 'old', status: 'failed' })]);
    expect(store.has('siteflow:failedWrites')).toBe(false);
  });
});

describe('try again', () => {
  it('checks the server first, so a change that did arrive is never recorded twice', async () => {
    store.set(KEY, JSON.stringify([entry({ status: 'failed', message: 'No' })]));
    const sync = await appStart();
    const op = vi.fn();
    sync.registerOps({ logMaterial: op });
    sync.registerChecks({ logMaterial: async () => true });
    await sync.reconcile();
    await sync.retry('e1');
    expect(op).not.toHaveBeenCalled();
    expect(saved()).toEqual([]);
  });

  it('otherwise sends the same change again, with the same ids', async () => {
    store.set(KEY, JSON.stringify([entry({ status: 'failed', message: 'No' })]));
    const sync = await appStart();
    const op = vi.fn();
    sync.registerOps({ logMaterial: op });
    sync.registerChecks({ logMaterial: async () => false });
    await sync.reconcile();
    await sync.retry('e1');
    expect(op).toHaveBeenCalledWith('c1', 's1', { logId: 'L1', qty: 5 });
    expect(sync.getJournal().find((e) => e.id === 'e1')).toBeUndefined();
  });

  it('try all again goes through every failed change; dismiss removes one', async () => {
    store.set(KEY, JSON.stringify([entry({ id: 'a', status: 'failed' }), entry({ id: 'b', status: 'failed' }), entry({ id: 'c', status: 'failed' })]));
    const sync = await appStart();
    const op = vi.fn();
    sync.registerOps({ logMaterial: op });
    sync.registerChecks({ logMaterial: async () => false });
    await sync.reconcile();
    await sync.dismiss('c');
    await sync.retryAll();
    expect(op).toHaveBeenCalledTimes(2);
    expect(saved()).toEqual([]);
  });
});

describe('connection', () => {
  it('shows offline, and checks waiting changes when signal returns', async () => {
    store.set(KEY, JSON.stringify([entry()]));
    const sync = await appStart();
    const check = vi.fn(async () => true);
    sync.registerChecks({ logMaterial: check });
    const stop = await sync.startSync();
    const [onNet] = netListeners;
    onNet({ isConnected: true, isInternetReachable: false }); // connected to Wi-Fi with no internet
    expect(sync.getSyncState().online).toBe(false);
    expect(check).not.toHaveBeenCalled();
    onNet({ isConnected: true, isInternetReachable: true });
    expect(sync.getSyncState().online).toBe(true);
    await sync.reconcile();
    expect(check).toHaveBeenCalled();
    expect(saved()).toEqual([]);
    stop();
    expect(netListeners.size).toBe(0);
  });
});
