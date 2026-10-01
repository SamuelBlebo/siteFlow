// Unit tests for the mobile sync tracker, with the native modules mocked
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map();
const net = { online: true };
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async (k) => store.get(k) ?? null, setItem: async (k, v) => { store.set(k, v); } },
}));
vi.mock('@react-native-community/netinfo', () => ({
  default: { fetch: async () => ({ isConnected: net.online }), addEventListener: () => () => {} },
}));
vi.mock('@react-native-firebase/auth', () => ({
  default: Object.assign(() => ({ currentUser: { uid: 'u1' }, onAuthStateChanged: () => () => {} }), {}),
}));

// Storage mock: files listed in `uploaded` exist; putFile fails for URIs in `badUris`
const uploaded = new Set();
const badUris = new Map();
vi.mock('@react-native-firebase/storage', () => ({
  default: () => ({
    ref: (path) => ({
      getDownloadURL: async () => { if (!uploaded.has(path)) throw Object.assign(new Error('nope'), { code: 'storage/object-not-found' }); return `https://files/${path}`; },
      putFile: async (uri) => { if (badUris.has(uri)) throw badUris.get(uri); uploaded.add(path); },
    }),
  }),
}));
const reportUpdates = [];
vi.mock('@react-native-firebase/firestore', () => {
  const fs = () => ({ doc: (p) => ({ update: async (data) => { reportUpdates.push({ p, data }); } }) });
  fs.FieldValue = { arrayUnion: (...v) => ({ arrayUnion: v }) };
  return { default: fs };
});

const { track, retry, dismiss, getSyncState, registerOps, startSync } = await import('../src/lib/sync');

beforeEach(async () => {
  for (const f of getSyncState().failed) dismiss(f.id);
  store.clear(); uploaded.clear(); badUris.clear(); reportUpdates.length = 0;
  net.online = true;
});

describe('sync tracker', () => {
  it('keeps a rejected write with its data and a friendly message', async () => {
    await startSync();
    const p = Promise.reject(Object.assign(new Error('7 PERMISSION_DENIED'), { code: 'firestore/permission-denied' }));
    await track(p, { label: 'Cement usage', op: 'logMaterial', args: ['c1', 's1', { qty: 5 }] }).catch(() => {});
    await new Promise((r) => setTimeout(r, 0));
    const [f] = getSyncState().failed;
    expect(f).toMatchObject({ label: 'Cement usage', op: 'logMaterial', args: ['c1', 's1', { qty: 5 }] });
    expect(f.message).toMatch(/permission/i);
    expect(f.message).not.toMatch(/PERMISSION_DENIED/);
    expect(JSON.parse(store.get('siteflow:failedWrites'))).toHaveLength(1); // survives an app restart
  });

  it('retry runs the same write again and clears the failure', async () => {
    const op = vi.fn();
    registerOps({ addWorker: op });
    await track(Promise.reject({ code: 'unavailable' }), { label: 'New worker Ama', op: 'addWorker', args: ['c1', 's1', { name: 'Ama' }] }).catch(() => {});
    await new Promise((r) => setTimeout(r, 0));
    retry(getSyncState().failed[0].id);
    expect(op).toHaveBeenCalledWith('c1', 's1', { name: 'Ama' });
    expect(getSyncState().failed).toHaveLength(0);
  });

  it('counts pending writes', async () => {
    let resolve;
    const p = new Promise((r) => { resolve = r; });
    track(p, { label: 'x', op: 'x', args: [] });
    expect(getSyncState().pending).toBe(1);
    resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(getSyncState().pending).toBe(0);
  });
});
