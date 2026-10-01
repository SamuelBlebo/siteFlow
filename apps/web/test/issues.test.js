// Issues end to end against the emulators: report, assign, work, resolve, close, comment, find
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, getDocs, terminate } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { filterIssues, issueActions, siteAlerts, siteInput, sortIssues, validate } from '@siteflow/shared';
import { auth, db, functions } from '../src/firebase';
import {
  addComment, commentsQuery, companyIssuesQuery, createIssue, createSite, issueRef, newIssueId, openIssuesQuery, siteDoc,
  siteIssuesQuery, updateIssue, uploadIssuePhotos,
} from '../src/lib/db';
import { changePassword, team } from '../src/lib/account';
import { save, SaveError } from '../src/lib/save';

globalThis.navigator ??= {};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const run = `${Date.now()}-i`;
const email = (who) => `${who}-${run}@example.com`;
const pw = { owner: 'owner-pass-1' };
const ids = {};
const names = { owner: 'Abena Sarpong', super: 'super person', super2: 'super2 person', manager: 'manager person' };
let cid, site, issueId;
const as = async (who) => { await signOut(auth); const u = (await signInWithEmailAndPassword(auth, email(who), pw[who])).user; return { uid: u.uid, name: names[who] }; };
const read = async (id = issueId) => (await getDoc(issueRef(cid, site.id, id))).data();
const input = (extra = {}) => ({ title: 'Scaffold boards loose on level 2', description: 'Two boards move when stepped on', priority: 'critical', category: 'Safety', location: 'Block A', dueDate: '', ...extra });

beforeAll(async () => {
  const { user } = await createUserWithEmailAndPassword(auth, email('owner'), pw.owner);
  await httpsCallable(functions, 'createCompany')({ companyName: 'Sarpong Builders', name: names.owner });
  cid = user.uid;
  const v = validate(siteInput, { name: 'Cape Coast hostel', location: 'Cape Coast', stage: 'Blockwork', budget: 900000 });
  const r = createSite(cid, v.data); await r.done;
  site = { id: r.id, name: 'Cape Coast hostel' };
  for (const [who, role] of [['super', 'supervisor'], ['super2', 'supervisor'], ['manager', 'manager']]) {
    const res = await team.invite({ name: names[who], email: email(who), role, siteIds: role === 'supervisor' ? [site.id] : [] });
    ids[who] = res.uid; pw[who] = res.tempPassword;
  }
  for (const who of ['super', 'super2', 'manager']) { await as(who); await changePassword(pw[who], `${who}-own-pass`); pw[who] = `${who}-own-pass`; }
});
afterAll(async () => { await signOut(auth); await terminate(db); });

describe('reporting', () => {
  it('a supervisor reports a critical issue with a photo', async () => {
    const me = await as('super');
    issueId = newIssueId(cid, site.id);
    const photos = await uploadIssuePhotos(cid, site.id, issueId, [new File([new Uint8Array([0xff, 0xd8, 0xff])], 'p.jpg', { type: 'image/jpeg' })]);
    await save(createIssue(cid, site, input(), { id: issueId, ...me, photos }));
    expect(await read()).toMatchObject({ status: 'open', priority: 'critical', assignedTo: null, photoCount: 1, createdByName: names.super, siteName: 'Cape Coast hostel' });
  });
  it('a supervisor cannot assign when reporting; a manager can', async () => {
    const me = await as('super');
    await expect(save(createIssue(cid, site, input({ title: 'Another one' }), { id: newIssueId(cid, site.id), ...me, assignedTo: me.uid, assignedToName: me.name })))
      .rejects.toBeInstanceOf(SaveError);
    const m = await as('manager');
    const id = newIssueId(cid, site.id);
    await save(createIssue(cid, site, input({ title: 'No water on site', priority: 'high', category: 'Utilities' }), { id, ...m, assignedTo: ids.super2, assignedToName: names.super2 }));
    expect((await read(id)).assignedToName).toBe(names.super2);
  });
});

describe('working an issue', () => {
  it('the manager assigns it to a supervisor and sets a fix-by date (noted in the timeline)', async () => {
    const m = await as('manager');
    await save(updateIssue(cid, site.id, issueId, { assignedTo: ids.super, assignedToName: names.super, dueDate: '2026-06-20' }, { note: `gave it to ${names.super}`, ...m }));
    expect(await read()).toMatchObject({ assignedTo: ids.super, dueDate: '2026-06-20' });
  });
  it('another supervisor can comment but cannot change it', async () => {
    const other = await as('super2');
    expect(issueActions(await read(), { uid: other.uid, role: 'supervisor' })).toMatchObject({ comment: true, start: false, resolve: false });
    await save(addComment(cid, site.id, issueId, 'I can lend boards from my site', other));
    await expect(save(updateIssue(cid, site.id, issueId, { priority: 'low' }, other))).rejects.toBeInstanceOf(SaveError);
    expect((await read()).commentCount).toBe(1);
  });
  it('the assignee starts it, then resolves it with how it was fixed', async () => {
    const me = await as('super');
    await save(updateIssue(cid, site.id, issueId, { status: 'in_progress' }, { note: 'started working on it', ...me }));
    await expect(save(updateIssue(cid, site.id, issueId, { status: 'closed' }, me))).rejects.toBeInstanceOf(SaveError);
    await save(updateIssue(cid, site.id, issueId, { status: 'resolved', resolution: 'Boards replaced and nailed', resolvedBy: me.uid, resolvedByName: me.name }, { note: 'marked it resolved', ...me }));
    const i = await read();
    expect(i).toMatchObject({ status: 'resolved', resolution: 'Boards replaced and nailed', resolvedByName: names.super });
    expect(i.resolvedAt).toBeTruthy();
  });
  it('the manager checks and closes it; the timeline has every step in order', async () => {
    const m = await as('manager');
    await save(updateIssue(cid, site.id, issueId, { status: 'closed' }, { note: 'checked the fix and closed it', ...m }));
    const timeline = (await getDocs(commentsQuery(cid, site.id, issueId))).docs.map((d) => `${d.data().kind}:${d.data().text}`);
    expect(timeline).toEqual([
      `update:gave it to ${names.super}`, 'comment:I can lend boards from my site', 'update:started working on it',
      'update:marked it resolved', 'update:checked the fix and closed it',
    ]);
  });
});

describe('finding issues', () => {
  it('the owner sees open issues across the company, sorted, with alerts for urgent ones', async () => {
    await as('owner');
    const open = (await getDocs(openIssuesQuery(cid))).docs.map((d) => ({ id: d.id, ...d.data() }));
    expect(open.map((i) => i.title)).toEqual(['No water on site']);
    const all = (await getDocs(companyIssuesQuery(cid))).docs.map((d) => ({ id: d.id, ...d.data() }));
    expect(sortIssues(all).map((i) => i.status)).toEqual(['open', 'closed']);
    expect(filterIssues(all, { q: 'nailed' })).toHaveLength(1);
    const s = { id: site.id, ...(await getDoc(siteDoc(cid, site.id))).data() };
    expect(siteAlerts(s, [], {}, { openIssues: open }).map((a) => a.title)).toContain('High priority issue: No water on site');
  });
  it('supervisors see their site issues but not the company-wide list', async () => {
    await as('super');
    expect((await getDocs(siteIssuesQuery(cid, site.id))).size).toBe(2);
    await expect(getDocs(openIssuesQuery(cid))).rejects.toThrow();
  });
});
