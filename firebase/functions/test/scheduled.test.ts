// The scheduled jobs, against the Firestore emulator: who gets reminded, the weekly summary,
// and retrying failed messages. Nothing is really sent (test mode logs them as skipped).
import { beforeEach, describe, expect, it } from 'vitest';
import '../src/setup';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { paths, type Company } from '@siteflow/shared';
import { remindMissingReports, sendWeeklySummary } from '../src/reminders';
import { retryFailedNotifications } from '../src/deliver';

const db = getFirestore();
const CID = 'sched-co';
const company = { id: CID, name: 'Asante Builders' } as Company;
const TODAY = '2026-06-15';

async function clear() {
  for (const coll of [paths.notifications(CID), paths.sites(CID)]) {
    const s = await db.collection(coll).get();
    await Promise.all(s.docs.map((d) => db.recursiveDelete(d.ref)));
  }
  const users = await db.collection(paths.users()).where('companyId', '==', CID).get();
  await Promise.all(users.docs.map((d) => d.ref.delete()));
}
const user = (id: string, data: Record<string, unknown>) => db.doc(paths.user(id)).set({ companyId: CID, active: true, ...data });
const site = (id: string, data: Record<string, unknown>) => db.doc(paths.site(CID, id)).set({ name: id, status: 'active', progress: 0, ...data });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const log = async () => (await db.collection(paths.notifications(CID)).get()).docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, any>);

beforeEach(async () => {
  await clear();
  await db.doc(paths.company(CID)).set({ name: 'Asante Builders' });
  await user('own', { role: 'owner', name: 'Ama Owner', email: 'ama@example.com', phone: '0200000001' });
  await user('sup', { role: 'supervisor', name: 'Kofi Mensah', phone: '0241234567', siteIds: ['adenta', 'tema', 'hold'] });
  await user('off', { role: 'supervisor', name: 'Yaw Off', phone: '0240000009', siteIds: ['adenta'], active: false });
});

describe('6pm missing-report reminder', () => {
  it('reminds the supervisors of active sites without a report today, plus a foreman without a login', async () => {
    await site('adenta', { name: 'Adenta', lastReportDate: '2026-06-14', foremanName: 'Kwame Foreman', foremanPhone: '0551112222' });
    await site('tema', { name: 'Tema', lastReportDate: TODAY });
    await site('hold', { name: 'On hold', status: 'on_hold', lastReportDate: '2026-06-01' });
    await remindMissingReports(company, TODAY);
    const sent = await log();
    // Adenta only: Kofi (supervisor) and Kwame (foreman)
    expect(sent.every((n) => n.kind === 'report_missing' && n.siteId === 'adenta')).toBe(true);
    expect([...new Set(sent.map((n) => n.toName))].sort()).toEqual(['Kofi Mensah', 'Kwame Foreman']);
    expect(sent.find((n) => n.toName === 'Kofi Mensah')?.text).toContain('Hi Kofi');
    expect(sent.every((n) => n.status === 'skipped')).toBe(true); // test mode: nothing left the machine
    expect(sent.some((n) => n.toName === 'Yaw Off')).toBe(false); // switched off
  });

  it('running twice the same day never reminds anyone twice', async () => {
    await site('adenta', { name: 'Adenta', lastReportDate: '2026-06-14' });
    await remindMissingReports(company, TODAY);
    const first = (await log()).length;
    await remindMissingReports(company, TODAY);
    expect((await log()).length).toBe(first);
    expect(first).toBeGreaterThan(0);
  });

  it('a foreman who is also a SiteFlow user is reminded once, not twice', async () => {
    await site('adenta', { name: 'Adenta', lastReportDate: '2026-06-14', foremanName: 'Kofi Mensah', foremanPhone: '0241234567' });
    await remindMissingReports(company, TODAY);
    expect((await log()).filter((n) => n.channel === 'whatsapp')).toHaveLength(1);
  });
});

describe('Friday weekly summary', () => {
  it('goes to the owner, with the spending of the week and the sites', async () => {
    await site('adenta', { name: 'Adenta', lastReportDate: TODAY, progress: 40 });
    await db.doc(paths.finance(CID, 'adenta')).set({ budget: 500000, spent: 120000 });
    await db.collection(paths.sub(CID, 'adenta', 'expenses')).add({ date: TODAY, category: 'Materials', amount: 48000 });
    await db.collection(paths.sub(CID, 'adenta', 'expenses')).add({ date: '2026-05-01', category: 'Materials', amount: 9999 }); // an earlier week
    await sendWeeklySummary(company, new Date(2026, 5, 19, 17));
    const sent = await log();
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((n) => n.kind === 'weekly_digest' && n.toName === 'Ama Owner')).toBe(true);
    const email = sent.find((n) => n.channel === 'email');
    expect(email?.text).toContain('Spent this week: GH₵48k.');
    expect(email?.text).toContain('Adenta: 40%');
  });

  it('a company with no active sites gets no summary', async () => {
    await sendWeeklySummary(company, new Date(2026, 5, 19, 17));
    expect(await log()).toEqual([]);
  });
});

describe('retrying failed messages', () => {
  it('retries those worth retrying, and gives up after three attempts', async () => {
    const base = { kind: 'critical_issue', channel: 'whatsapp', address: '0241234567', params: ['Adenta', 'Leak', 'Kofi'], text: 'x', createdAt: Timestamp.now() };
    await db.doc(`${paths.notifications(CID)}/again`).set({ ...base, status: 'failed', retry: true, attempts: 1 });
    await db.doc(`${paths.notifications(CID)}/enough`).set({ ...base, status: 'failed', retry: true, attempts: 3 });
    await db.doc(`${paths.notifications(CID)}/final`).set({ ...base, status: 'failed', retry: false, attempts: 1 });
    await retryFailedNotifications();
    const byId = Object.fromEntries((await log()).map((n) => [n.id, n]));
    expect(byId.again).toMatchObject({ status: 'skipped', attempts: 2 }); // tried again (test mode: skipped)
    expect(byId.enough).toMatchObject({ status: 'failed', retry: false, attempts: 3 });
    expect(byId.final).toMatchObject({ status: 'failed', attempts: 1 });
  });
});
