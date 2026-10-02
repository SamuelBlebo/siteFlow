// Notifications end to end on the emulators: real triggers write the message log (nothing is sent in test mode)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, getDocs, terminate } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { siteInput, validate } from '@siteflow/shared';
import { auth, db, functions } from '../src/firebase';
import {
  addComment, addMaterial, createIssue, createSite, logMaterial, newIssueId, notificationsQuery, sendReport, siteDoc, sub, subDoc,
  updateIssue, updateNotifications,
} from '../src/lib/db';
import { changePassword, team } from '../src/lib/account';
import { save } from '../src/lib/save';
import { waitFor } from './wait';

globalThis.navigator ??= {};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const run = `${Date.now()}-n`;
const email = (who) => `${who}-${run}@example.com`;
const pw = { owner: 'owner-pass-1' };
const names = { owner: 'Adwoa Boakye', manager: 'Kwabena Manager', super: 'Kofi Supervisor' };
const ids = {};
let cid, sid;
const as = async (who) => { await signOut(auth); const u = (await signInWithEmailAndPassword(auth, email(who), pw[who])).user; return { uid: u.uid, name: names[who] }; };
const site = async () => ({ id: sid, ...(await getDoc(siteDoc(cid, sid))).data() });
const logs = async () => { await as('owner'); return (await getDocs(notificationsQuery(cid, 200))).docs.map((d) => ({ id: d.id, ...d.data() })); };
const of = (all, kind) => all.filter((n) => n.kind === kind).map((n) => `${n.toName}/${n.channel}`).sort();
const issue = (extra = {}) => ({ title: 'Scaffold unsafe on level 2', description: '', priority: 'critical', category: 'Safety', location: '', dueDate: '', ...extra });

beforeAll(async () => {
  const { user } = await createUserWithEmailAndPassword(auth, email('owner'), pw.owner);
  await httpsCallable(functions, 'createCompany')({ companyName: 'Boakye Builders', name: names.owner });
  cid = user.uid;
  const v = validate(siteInput, { name: 'Sunyani clinic', location: 'Sunyani', stage: 'Blockwork', budget: 300000, foremanName: 'Yaw Foreman', foremanPhone: '0201112222' });
  const r = createSite(cid, v.data); await r.done; sid = r.id;
  for (const [who, role, phone] of [['manager', 'manager', '0241112222'], ['super', 'supervisor', '0551112222']]) {
    const res = await team.invite({ name: names[who], email: email(who), phone, role, siteIds: role === 'supervisor' ? [sid] : [] });
    ids[who] = res.uid; pw[who] = res.tempPassword;
  }
  for (const who of ['manager', 'super']) { await as(who); await changePassword(pw[who], `${who}-own-pass`); pw[who] = `${who}-own-pass`; }
});
afterAll(async () => { await signOut(auth); await terminate(db); });

describe('critical issues', () => {
  let issueId;
  it('reporting a critical issue alerts the owner and managers on their channels, not the reporter', { timeout: 60000 }, async () => {
    const me = await as('super');
    issueId = newIssueId(cid, sid);
    await save(createIssue(cid, await site(), issue(), { id: issueId, ...me }));
    // The first trigger in a fresh emulator can take a while to start
    const all = await waitFor(logs, (l) => of(l, 'critical_issue').length >= 3, { timeout: 45000 });
    expect(of(all, 'critical_issue')).toEqual([`${names.manager}/email`, `${names.manager}/whatsapp`, `${names.owner}/email`].sort()); // the owner has no number
    const n = all.find((x) => x.kind === 'critical_issue' && x.channel === 'whatsapp');
    expect(n).toMatchObject({ status: 'skipped', to: '…2222', error: expect.stringMatching(/Test mode/) });
    expect(n.text).toBe(`SiteFlow: critical issue at Sunyani clinic: Scaffold unsafe on level 2. Reported by ${names.super}. Open SiteFlow to assign it.`);
  });
  it('later changes to the same issue never message people twice', async () => {
    const me = await as('super');
    await save(addComment(cid, sid, issueId, 'Boards on the way', me));
    await new Promise((r) => setTimeout(r, 2500));
    expect(of(await logs(), 'critical_issue')).toHaveLength(3);
  });
  it('giving the issue to the supervisor tells them (WhatsApp by default)', async () => {
    const m = await as('manager');
    await save(updateIssue(cid, sid, issueId, { assignedTo: ids.super, assignedToName: names.super }, m));
    const all = await waitFor(logs, (l) => of(l, 'issue_assigned').length >= 1);
    expect(of(all, 'issue_assigned')).toEqual([`${names.super}/whatsapp`]);
  });
});

describe('owner settings', () => {
  it('switching WhatsApp off for critical issues leaves email only', async () => {
    await as('owner');
    await save(updateNotifications(cid, { critical_issue: { whatsapp: false, email: true } }));
    const me = await as('super');
    const id = newIssueId(cid, sid);
    await save(createIssue(cid, await site(), issue({ title: 'Generator fire risk' }), { id, ...me }));
    const all = await waitFor(logs, (l) => l.filter((n) => n.kind === 'critical_issue' && n.text.includes('Generator')).length >= 2);
    expect(all.filter((n) => n.kind === 'critical_issue' && n.text.includes('Generator')).map((n) => n.channel)).toEqual(['email', 'email']);
  });
  it('daily report alerts are off by default, and come once switched on', { timeout: 60000 }, async () => {
    const me = await as('super');
    const s = await site();
    await save(sendReport(cid, s, { text: 'Blockwork', stage: 'Blockwork', progress: 20, workersPresent: 5 }, { ...me, date: '2026-06-01' }).done);
    await new Promise((r) => setTimeout(r, 8000)); // let that report's trigger run while the setting is still off
    expect(of(await logs(), 'report_submitted')).toEqual([]);
    await save(updateNotifications(cid, { report_submitted: { whatsapp: true, email: false } }));
    await as('super');
    await save(sendReport(cid, await site(), { text: 'Lintels', stage: 'Lintel level', progress: 25, workersPresent: 6, issues: 'Rain stopped work' }, { ...me, date: '2026-06-02' }).done);
    const all = await waitFor(logs, (l) => of(l, 'report_submitted').length >= 1);
    expect(of(all, 'report_submitted')).toEqual([`${names.manager}/whatsapp`]);
    expect(all.find((n) => n.kind === 'report_submitted').text).toContain('Issue: Rain stopped work');
  });
});

describe('low stock', () => {
  it('dropping below the reorder level alerts once (email by default), not the person who recorded it', async () => {
    const m = await as('manager');
    await save(addMaterial(cid, sid, { name: 'Cement', unit: 'bags', stock: 20, reorderLevel: 10, avgDaily: 5 }));
    const mat = (await getDocs(sub(cid, sid, 'materials'))).docs[0];
    const me = await as('super');
    const material = async () => ({ id: mat.id, ...(await getDoc(subDoc(cid, sid, 'materials', mat.id))).data() });
    await save(logMaterial(cid, sid, { material: await material(), type: 'usage', qty: 15, ...me, uid: me.uid }));
    await save(logMaterial(cid, sid, { material: await material(), type: 'usage', qty: 2, ...me, uid: me.uid })); // still below: no new alert
    const all = await waitFor(logs, (l) => of(l, 'low_stock').length >= 2);
    await new Promise((r) => setTimeout(r, 2000));
    expect(of(await logs(), 'low_stock')).toEqual([`${names.owner}/email`, `${names.manager}/email`].sort());
    expect(all.find((n) => n.kind === 'low_stock').text).toBe('SiteFlow: Cement is running low at Sunyani clinic: 5 bags left (reorder below 10 bags).');
    void m;
  });
});

describe('the message log', () => {
  it('is hidden from site staff', async () => {
    await as('super');
    await expect(getDocs(notificationsQuery(cid))).rejects.toThrow();
  });
});
