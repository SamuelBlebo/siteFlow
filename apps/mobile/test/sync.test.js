// Unit tests for the mobile sync tracker and photo queue, with the native modules mocked
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
const queue = await import('../src/lib/uploadQueue');

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

describe('photo queue', () => {
  const item = (n, uri = `file://p${n}.jpg`) => ({ cid: 'c1', sid: 's1', reportId: 'r1', uri, uid: 'u1', n });

  it('waits while offline, then uploads', async () => {
    net.online = false;
    await queue.enqueuePhotos([item(1)]);
    await queue.processQueue();
    expect(JSON.parse(store.get('siteflow:photoQueue'))).toHaveLength(1);
    net.online = true;
    await queue.processQueue();
    expect(JSON.parse(store.get('siteflow:photoQueue'))).toEqual([]);
  });

  it('uploads photos and attaches them to the report', async () => {
    await queue.enqueuePhotos([item(1), item(2)]);
    await queue.processQueue();
    expect(reportUpdates).toHaveLength(2);
    expect(JSON.parse(store.get('siteflow:photoQueue'))).toEqual([]);
  });

  it('a photo that cannot upload does not block the others', async () => {
    badUris.set('file://gone.jpg', Object.assign(new Error('ENOENT: no such file'), { code: 'storage/file-not-found' }));
    await queue.enqueuePhotos([item(1, 'file://gone.jpg'), item(2)]);
    await queue.processQueue();
    const q = JSON.parse(store.get('siteflow:photoQueue'));
    expect(reportUpdates).toHaveLength(1);
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ failed: true, error: 'The photo file is no longer on this phone.' });
  });

  it('connection problems are retried later, not given up', async () => {
    badUris.set('file://flaky.jpg', { code: 'storage/unavailable' });
    await queue.enqueuePhotos([item(1, 'file://flaky.jpg')]);
    await queue.processQueue();
    let q = JSON.parse(store.get('siteflow:photoQueue'));
    expect(q[0]).toMatchObject({ failed: false, attempts: 1 });
    badUris.clear();
    await queue.processQueue();
    q = JSON.parse(store.get('siteflow:photoQueue'));
    expect(q).toEqual([]);
  });

  it('a retry after a half-finished upload reuses the file (no duplicate, no overwrite)', async () => {
    net.online = false; // queue it without uploading
    await queue.enqueuePhotos([item(1)]);
    await queue.processQueue();
    expect(reportUpdates).toHaveLength(0);
    net.online = true;
    const [queued] = JSON.parse(store.get('siteflow:photoQueue'));
    uploaded.add(`companies/c1/sites/s1/reports/r1/${queued.id}.jpg`); // uploaded, but the report update never happened
    badUris.set(queued.uri, new Error('should not upload again'));
    await queue.processQueue();
    expect(reportUpdates).toHaveLength(1);
    expect(JSON.parse(store.get('siteflow:photoQueue'))).toEqual([]);
  });

  it('failed photos can be retried or removed', async () => {
    badUris.set('file://denied.jpg', { code: 'storage/unauthorized' });
    await queue.enqueuePhotos([item(1, 'file://denied.jpg')]);
    await queue.processQueue();
    badUris.clear();
    await queue.retryFailedPhotos();
    await new Promise((r) => setTimeout(r, 10));
    await queue.processQueue();
    expect(JSON.parse(store.get('siteflow:photoQueue'))).toEqual([]);
    badUris.set('file://denied2.jpg', { code: 'storage/unauthorized' });
    await queue.enqueuePhotos([item(2, 'file://denied2.jpg')]);
    await queue.processQueue();
    await queue.discardFailedPhotos();
    expect(JSON.parse(store.get('siteflow:photoQueue'))).toEqual([]);
  });

  it('only uploads the signed-in user’s photos', async () => {
    await queue.enqueuePhotos([{ ...item(1), uid: 'someone-else' }]);
    await queue.processQueue();
    expect(reportUpdates).toHaveLength(0);
    expect(JSON.parse(store.get('siteflow:photoQueue'))).toHaveLength(1);
  });
});
