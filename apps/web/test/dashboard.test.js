// The dashboard's queries and calculations against the emulators, with real reports and issues
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, getDocs, terminate } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  activityFeed, dailyTotals, issueFlow, rankAlerts, recentWorkDays, reportCompliance, siteAlerts, siteInput, todayKey, validate,
} from '@siteflow/shared';
import { auth, db, functions } from '../src/firebase';
import {
  companyIssuesQuery, companyReportsQuery, createIssue, createSite, newIssueId, openIssuesQuery, sendReport, siteDoc, sitesCol,
} from '../src/lib/db';
import { team } from '../src/lib/account';
import { save } from '../src/lib/save';
import { join } from './join';

globalThis.navigator ??= {};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const run = `${Date.now()}-d`;
const email = (who) => `${who}-${run}@example.com`;
const pw = { owner: 'owner-pass-1' };
let cid, a, b, me;
const days = recentWorkDays(14);
const as = async (who) => { await signOut(auth); return (await signInWithEmailAndPassword(auth, email(who), pw[who])).user; };
const siteOf = async (sid) => ({ id: sid, ...(await getDoc(siteDoc(cid, sid))).data() });

beforeAll(async () => {
  const { user } = await createUserWithEmailAndPassword(auth, email('owner'), pw.owner);
  await httpsCallable(functions, 'createCompany')({ companyName: 'Osei Construction', name: 'Yaw Osei' });
  cid = user.uid;
  const mk = async (name) => { const v = validate(siteInput, { name, location: 'Kumasi', stage: 'Blockwork', budget: 200000, foremanPhone: '0241234567', foremanName: 'Kojo' }); const r = createSite(cid, v.data); await r.done; return r.id; };
  a = await mk('Ahodwo villa');
  b = await mk('Suame shops');
  const res = await team.invite({ name: 'Kofi Mensah', email: email('super'), role: 'supervisor', siteIds: [a, b] });
  pw.super = await join(res, 'super-own-pass');
  const u = await as('super');
  me = { uid: u.uid, name: 'Kofi Mensah' };
  // Site A reports on three of the last working days (today included); site B on one
  const report = (workers) => ({ text: 'Blockwork continues', stage: 'Blockwork', progress: 30, workersPresent: workers });
  for (const [i, d] of [days[0], days[1], days[3]].entries()) await save(sendReport(cid, await siteOf(a), report(5 + i), { ...me, date: d, time: '17:00' }).done);
  await save(sendReport(cid, await siteOf(b), report(9), { ...me, date: days[2], time: '16:00' }).done);
  await save(createIssue(cid, await siteOf(b), { title: 'Generator broken', priority: 'critical', category: 'Equipment', description: '', location: '', dueDate: '' }, { id: newIssueId(cid, b), ...me }));
  await save(createIssue(cid, await siteOf(a), { title: 'Late cement', priority: 'medium', category: 'Materials', description: '', location: '', dueDate: '' }, { id: newIssueId(cid, a), ...me }));
});
afterAll(async () => { await signOut(auth); await terminate(db); });

describe('owner dashboard', () => {
  it('report reliability, workers per day and issues come from the company-wide queries', async () => {
    await as('owner');
    const reports = (await getDocs(companyReportsQuery(cid, { from: days[days.length - 1] }, 500))).docs.map((d) => ({ id: d.id, ...d.data() }));
    expect(reports).toHaveLength(4);
    const c = reportCompliance(reports, [a, b], days);
    expect(c[a]).toMatchObject({ sent: 3, expected: 14 });
    expect(c[b]).toMatchObject({ sent: 1, pct: 7 });
    const perDay = dailyTotals(reports, days);
    expect(perDay.find((d) => d.date === days[0]).workers).toBe(5);
    expect(perDay.reduce((n, d) => n + d.workers, 0)).toBe(5 + 6 + 7 + 9);
    const issues = (await getDocs(companyIssuesQuery(cid))).docs.map((d) => ({ id: d.id, ...d.data() }));
    expect(issueFlow(issues, days[days.length - 1])).toMatchObject({ opened: 2, open: 2, critical: 1 });
    const feed = activityFeed(reports, issues, 10);
    expect(feed).toHaveLength(6);
    expect(feed[0].kind).toBe('issue'); // reported last
  });
  it('needs attention: critical issue and the missing report come first', async () => {
    await as('owner');
    const sites = (await getDocs(sitesCol(cid))).docs.map((d) => ({ id: d.id, ...d.data() }));
    const open = (await getDocs(openIssuesQuery(cid))).docs.map((d) => d.data());
    const alerts = rankAlerts(sites.flatMap((s) => siteAlerts(s, [], {}, { openIssues: open.filter((i) => i.siteId === s.id) }).map((x) => ({ ...x, site: s }))));
    expect(alerts.map((x) => `${x.kind}:${x.site.name}`)).toEqual(['issue:Suame shops', 'report:Suame shops']);
    expect(sites.find((s) => s.id === a).lastReportDate).toBe(todayKey());
  });
});
