// The daily report outbox, with phone storage, network, files and Firebase mocked
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map();
const net = { online: true };
const files = new Set();
const fileTimes = new Map(); // seconds, like expo-file-system's modificationTime
const server = { docs: new Map(), uploads: new Set(), writes: [], failNextCommit: null, failUpload: null };

vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async (k) => store.get(k) ?? null, setItem: async (k, v) => { store.set(k, v); }, removeItem: async (k) => { store.delete(k); } },
}));
vi.mock('@react-native-community/netinfo', () => ({ default: { fetch: async () => ({ isConnected: net.online }), addEventListener: () => () => {} } }));
const signedIn = { uid: 'u1' };
vi.mock('@react-native-firebase/auth', () => ({ default: () => ({ currentUser: signedIn.uid ? { uid: signedIn.uid } : null, onAuthStateChanged: () => () => {} }) }));
vi.mock('expo-file-system', () => ({
  documentDirectory: 'file:///app/',
  makeDirectoryAsync: async () => {},
  copyAsync: async ({ to }) => { files.add(to); fileTimes.set(to, Date.now() / 1000); },
  getInfoAsync: async (p) => ({ exists: files.has(p), modificationTime: fileTimes.get(p) }),
  deleteAsync: async (p) => { files.delete(p); },
  readDirectoryAsync: async (dir) => [...files].filter((f) => f.startsWith(dir)).map((f) => f.slice(dir.length)),
}));
vi.mock('expo-image-manipulator', () => ({ manipulateAsync: async (uri) => ({ uri: `${uri}.small.jpg` }), SaveFormat: { JPEG: 'jpeg' } }));
vi.mock('@react-native-firebase/storage', () => ({
  default: () => ({
    ref: (path) => ({
      getDownloadURL: async () => { if (!server.uploads.has(path)) throw { code: 'storage/object-not-found' }; return `https://files/${path}`; },
      putFile: async () => {
        if (!net.online) throw { code: 'storage/unavailable' };
        if (server.failUpload) { const e = server.failUpload; server.failUpload = null; throw e; }
        server.uploads.add(path);
      },
    }),
  }),
}));
vi.mock('@react-native-firebase/firestore', () => {
  const doc = (path) => ({
    path,
    set: async (data) => {
      if (!net.online) throw { code: 'firestore/unavailable' };
      if (server.failNextCommit) { const e = server.failNextCommit; server.failNextCommit = null; throw e; }
      server.writes.push(['set', path]); server.docs.set(path, data);
    },
    get: async () => {
      if (!net.online) throw { code: 'firestore/unavailable' };
      const d = server.docs.get(path);
      return { exists: () => !!d, data: () => d };
    },
  });
  const fs = () => ({
    doc,
    collection: (p) => ({
      doc: () => ({ id: 'iss1', path: `${p}/iss1` }),
      limit: () => ({ get: async () => {
        if (!net.online) throw { code: 'firestore/unavailable' };
        return { empty: ![...server.docs.keys()].some((k) => k.startsWith(`${p}/`)) };
      } }),
    }),
    batch: () => {
      const ops = [];
      return {
        set: (ref, data) => ops.push(['set', ref.path, data]),
        update: (ref, data) => ops.push(['update', ref.path, data]),
        commit: async () => {
          if (!net.online) throw { code: 'firestore/unavailable' };
          if (server.failNextCommit) { const e = server.failNextCommit; server.failNextCommit = null; throw e; }
          for (const [kind, path, data] of ops) {
            server.writes.push([kind, path]);
            server.docs.set(path, kind === 'set' ? data : { ...server.docs.get(path), ...data });
          }
        },
      };
    },
  });
  fs.FieldValue = { serverTimestamp: () => 'ts' };
  return { default: fs };
});

const { todayKey } = await import('@siteflow/shared');
const today = todayKey();
const site = { id: 's1', name: 'Adenta house' };
const input = { text: 'Blockwork', notes: '', issues: '', weather: 'Sunny', stage: 'Blockwork', progress: 30, workersPresent: 6 };
const reportPath = `companies/c1/sites/s1/reports/${today}_u1`;

beforeEach(async () => {
  store.clear(); files.clear(); server.docs.clear(); server.uploads.clear(); server.writes.length = 0;
  server.failNextCommit = null; server.failUpload = null; net.online = true; signedIn.uid = 'u1';
  vi.resetModules(); // each test starts with a fresh outbox, as after an app restart
});
const fresh = () => import('../src/lib/reportOutbox');

describe('report outbox', () => {
  beforeEach(() => {
    server.docs.set('companies/c1/members/u1', { name: 'Kofi Mensah' });
    server.docs.set('companies/c1/sites/s1', { name: 'Adenta house', lastReportDate: '2026-01-01' });
  });

  it('with signal: uploads photos, writes the report once, then marks it sent and clears the copies', async () => {
    const o = await fresh();
    await o.queueReport({ cid: 'c1', site, uid: 'u1', name: 'Kofi', input, photoUris: ['file:///cache/a.jpg', 'file:///cache/b.jpg'] });
    await o.processOutbox();
    const r = server.docs.get(reportPath);
    expect(r).toMatchObject({
      companyId: 'c1', siteId: 's1', siteName: 'Adenta house', date: today, text: 'Blockwork', workersPresent: 6,
      photoCount: 2, createdBy: 'u1', createdByName: 'Kofi Mensah', source: 'app', createdAt: 'ts',
    });
    expect(r.photos).toHaveLength(2);
    expect(r.thumbs).toEqual([`https://files/${reportPath}/1-thumb.jpg`, `https://files/${reportPath}/2-thumb.jpg`]);
    expect(server.docs.get('companies/c1/sites/s1')).toMatchObject({ stage: 'Blockwork', progress: 30, lastReportDate: today });
    expect(o.getOutbox()[0].status).toBe('sent');
    expect(files.size).toBe(0);
  });

  it('without signal: saved on the phone with private photo copies, sent when signal returns', async () => {
    net.online = false;
    const o = await fresh();
    await o.queueReport({ cid: 'c1', site, uid: 'u1', name: 'Kofi', input, photoUris: ['file:///cache/a.jpg'] });
    await o.processOutbox();
    expect(o.getOutbox()[0].status).toBe('waiting');
    expect([...files][0]).toMatch(/^file:\/\/\/app\/report-photos\//);
    expect(JSON.parse(store.get('siteflow:reportOutbox'))).toHaveLength(1); // survives the app closing
    net.online = true;
    await o.processOutbox();
    expect(o.getOutbox()[0].status).toBe('sent');
    expect(server.docs.has(reportPath)).toBe(true);
  });

  it('a report already on the server (earlier attempt got through) is marked sent without writing again', async () => {
    server.docs.set(reportPath, { text: 'already there' });
    const o = await fresh();
    await o.queueReport({ cid: 'c1', site, uid: 'u1', name: 'Kofi', input });
    await o.processOutbox();
    expect(o.getOutbox()[0].status).toBe('sent');
    expect(server.writes).toEqual([]);
  });

  it('a connection drop mid-send is retried and reuses photos that already uploaded', async () => {
    server.failNextCommit = { code: 'firestore/unavailable' };
    const o = await fresh();
    await o.queueReport({ cid: 'c1', site, uid: 'u1', name: 'Kofi', input, photoUris: ['file:///cache/a.jpg'] });
    await o.processOutbox();
    expect(o.getOutbox()[0]).toMatchObject({ status: 'waiting', attempts: 1 });
    expect(o.getOutbox()[0].photos[0].url).toMatch(/^https:\/\/files\//); // upload progress remembered
    await o.processOutbox();
    expect(o.getOutbox()[0].status).toBe('sent');
    expect([...server.uploads].sort()).toEqual([`${reportPath}/1-thumb.jpg`, `${reportPath}/1.jpg`]); // photo and small copy, once each
  });

  it('a permanent problem marks it failed and keeps it; retry sends it; delete removes it', async () => {
    server.failNextCommit = { code: 'firestore/permission-denied' };
    const o = await fresh();
    await o.queueReport({ cid: 'c1', site, uid: 'u1', name: 'Kofi', input, photoUris: ['file:///cache/a.jpg'] });
    await o.processOutbox();
    const item = o.getOutbox()[0];
    expect(item.status).toBe('failed');
    expect(item.error).toMatch(/permission/i);
    expect(files.size).toBe(2); // photo and its small copy still kept
    await o.retryReport(item.id);
    expect(o.getOutbox()[0].status).toBe('sent');
  });

  it('a failed report can be deleted, which removes its photo copies', async () => {
    server.failNextCommit = { code: 'firestore/permission-denied' };
    const o = await fresh();
    await o.queueReport({ cid: 'c1', site, uid: 'u1', name: 'Kofi', input, photoUris: ['file:///cache/c.jpg'] });
    await o.processOutbox();
    expect(o.getOutbox()[0].status).toBe('failed');
    await o.deleteReport(o.getOutbox()[0].id);
    expect(o.getOutbox()).toEqual([]);
    expect(files.size).toBe(0);
  });

  it('leftover photo files no report refers to are cleaned up; kept and very recent ones stay', async () => {
    net.online = false;
    const o = await fresh();
    await o.queueReport({ cid: 'c1', site, uid: 'u1', name: 'Kofi', input, photoUris: ['file:///cache/k.jpg'] });
    const kept = o.getOutbox()[0].photos[0].local;
    fileTimes.set(kept, 0);
    const old = 'file:///app/report-photos/orphan-1.jpg';
    const recent = 'file:///app/report-photos/orphan-2.jpg';
    files.add(old); fileTimes.set(old, 0);
    files.add(recent); fileTimes.set(recent, Date.now() / 1000);
    files.add('file:///app/other/keep.jpg'); fileTimes.set('file:///app/other/keep.jpg', 0);
    expect(await o.cleanPhotos()).toBe(1);
    expect([...files].sort()).toEqual(['file:///app/other/keep.jpg', kept, kept.replace('.jpg', '-thumb.jpg'), recent].sort());
  });

  it('a report saved by an older app version (photos without small copies) still sends', async () => {
    const local = 'file:///app/report-photos/old-1.jpg';
    files.add(local);
    store.set('siteflow:reportOutbox', JSON.stringify([{
      kind: 'report', label: 'Old', id: `s1/${today}_u1`, rid: `${today}_u1`, cid: 'c1', sid: 's1', siteName: 'Adenta house', uid: 'u1', name: 'Kofi',
      date: today, time: '17:00', input, materials: [], photos: [{ local, url: null }], status: 'waiting', attempts: 0, error: '', queuedAt: 1,
    }]));
    const o = await fresh();
    await o.processOutbox();
    expect(o.getOutbox()[0].status).toBe('sent');
    expect(server.docs.get(reportPath)).toMatchObject({ photoCount: 1, thumbs: [''] });
  });

  it('on a shared phone, a report is only sent while its author is signed in', async () => {
    net.online = false;
    const o = await fresh();
    await o.queueReport({ cid: 'c1', site, uid: 'u1', name: 'Kofi', input });
    net.online = true;
    signedIn.uid = 'u2';
    await o.processOutbox();
    expect(o.getOutbox()[0].status).toBe('waiting');
    signedIn.uid = 'u1';
    await o.processOutbox();
    expect(o.getOutbox()[0].status).toBe('sent');
  });

  it('at app start, a report caught mid-send goes back to waiting and is sent', async () => {
    store.set('siteflow:reportOutbox', JSON.stringify([{
      kind: 'report', label: 'Daily report', id: `s1/${today}_u1`, rid: `${today}_u1`, cid: 'c1', sid: 's1', siteName: 'Adenta house', uid: 'u1', name: 'Kofi',
      date: today, time: '17:00', input, materials: [], photos: [], status: 'sending', attempts: 0, error: '', queuedAt: 1,
    }]));
    const o = await fresh();
    const stop = o.startOutbox();
    await vi.waitFor(() => expect(o.getOutbox()[0]?.status).toBe('sent'));
    expect(server.docs.has(reportPath)).toBe(true);
    stop();
  });

  it('keeps only the 20 most recent sent reports on the phone', async () => {
    const old = Array.from({ length: 25 }, (_, i) => ({ id: `s1/old${i}`, kind: 'report', uid: 'u1', status: 'sent', sentAt: i, photos: [] }));
    store.set('siteflow:reportOutbox', JSON.stringify(old));
    const o = await fresh();
    await o.processOutbox();
    const kept = o.getOutbox();
    expect(kept).toHaveLength(20);
    expect(kept.some((x) => x.id === 's1/old0')).toBe(false); // the oldest went first
    expect(kept.some((x) => x.id === 's1/old24')).toBe(true);
  });

  it('a waiting or sent report cannot be deleted', async () => {
    net.online = false;
    const o = await fresh();
    await o.queueReport({ cid: 'c1', site, uid: 'u1', name: 'Kofi', input });
    await o.deleteReport(o.getOutbox()[0].id);
    expect(o.getOutbox()).toHaveLength(1);
  });

  it('the same report cannot be queued twice in a day', async () => {
    net.online = false;
    const o = await fresh();
    await o.queueReport({ cid: 'c1', site, uid: 'u1', name: 'Kofi', input });
    await expect(o.queueReport({ cid: 'c1', site, uid: 'u1', name: 'Kofi', input })).rejects.toMatchObject({ code: 'already-exists' });
  });

  it('a report sent late does not move the site backwards', async () => {
    server.docs.set('companies/c1/sites/s1', { name: 'Adenta house', lastReportDate: '2999-01-01', progress: 80, stage: 'Roofing' });
    const o = await fresh();
    await o.queueReport({ cid: 'c1', site, uid: 'u1', name: 'Kofi', input });
    await o.processOutbox();
    expect(server.docs.get('companies/c1/sites/s1')).toMatchObject({ progress: 80, stage: 'Roofing' });
    expect(server.docs.has(reportPath)).toBe(true);
  });

  it('a site with milestones keeps its progress: the report records it but does not change it', async () => {
    server.docs.set('companies/c1/sites/s1', { name: 'Adenta house', lastReportDate: '2026-01-01', progress: 42, stage: 'Foundation' });
    server.docs.set('companies/c1/sites/s1/milestones/m1', { name: 'Foundation', percentDone: 84 });
    const o = await fresh();
    await o.queueReport({ cid: 'c1', site, uid: 'u1', name: 'Kofi', input });
    await o.processOutbox();
    expect(server.docs.get(reportPath).progress).toBe(42);
    expect(server.docs.get('companies/c1/sites/s1')).toMatchObject({ progress: 42, stage: 'Blockwork', lastReportDate: today });
  });

  it('a missing photo file fails clearly instead of sending an incomplete report', async () => {
    const o = await fresh();
    await o.queueReport({ cid: 'c1', site, uid: 'u1', name: 'Kofi', input, photoUris: ['file:///cache/a.jpg'] });
    files.clear(); // the phone lost the file
    net.online = true;
    await o.processOutbox();
    expect(o.getOutbox()[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(/no longer on this phone/) });
    expect(server.docs.has(reportPath)).toBe(false);
  });
});

describe('issues in the outbox', () => {
  const issuePath = 'companies/c1/sites/s1/issues/iss1';
  const issueInput = { title: 'Water pipe burst', description: '', priority: 'critical', category: 'Utilities', location: 'Store', dueDate: '' };
  beforeEach(() => {
    server.docs.set('companies/c1/members/u1', { name: 'Kofi Mensah' });
    server.docs.set('companies/c1/sites/s1', { name: 'Adenta house' });
  });
  it('an issue with a photo is saved offline and sent when signal returns', async () => {
    net.online = false;
    const o = await fresh();
    const item = await o.queueIssue({ cid: 'c1', site, uid: 'u1', name: 'Kofi', input: issueInput, photoUris: ['file:///cache/i.jpg'] });
    expect(item).toMatchObject({ kind: 'issue', label: 'Issue "Water pipe burst"', status: 'waiting' });
    await o.processOutbox();
    expect(server.docs.has(issuePath)).toBe(false);
    net.online = true;
    await o.processOutbox();
    expect(server.docs.get(issuePath)).toMatchObject({
      companyId: 'c1', siteId: 's1', siteName: 'Adenta house', title: 'Water pipe burst', priority: 'critical', status: 'open',
      assignedTo: null, photoCount: 1, createdBy: 'u1', createdByName: 'Kofi Mensah', commentCount: 0,
    });
    expect(server.docs.get(issuePath).photos[0]).toMatch(/issues\/iss1\/1\.jpg$/);
    expect(o.getOutbox()[0].status).toBe('sent');
    expect(files.size).toBe(0);
  });
  it('an issue already on the server is not written twice', async () => {
    server.docs.set(issuePath, { title: 'already' });
    const o = await fresh();
    await o.queueIssue({ cid: 'c1', site, uid: 'u1', name: 'Kofi', input: issueInput });
    await o.processOutbox();
    expect(server.writes).toEqual([]);
    expect(o.getOutbox()[0].status).toBe('sent');
  });
  it('a refused issue is kept with its own label for Try again', async () => {
    server.failNextCommit = { code: 'firestore/permission-denied' };
    const o = await fresh();
    await o.queueIssue({ cid: 'c1', site, uid: 'u1', name: 'Kofi', input: issueInput });
    await o.processOutbox();
    expect(o.getOutbox()[0]).toMatchObject({ status: 'failed', label: 'Issue "Water pipe burst"' });
    await o.retryReport(o.getOutbox()[0].id);
    expect(o.getOutbox()[0].status).toBe('sent');
  });
});
