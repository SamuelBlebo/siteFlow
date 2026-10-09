// Milestones and progress against the emulators
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, getDocs, terminate } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { STAGES, scheduleStatus, siteInput, validate } from '@siteflow/shared';
import { auth, db, functions } from '../src/firebase';
import {
  addMilestone, addStandardMilestones, createSite, deleteMilestone, milestonesQuery, sendReport, setMilestoneProgress, siteDoc,
  swapMilestones, updateMilestonePlan,
} from '../src/lib/db';
import { team } from '../src/lib/account';
import { save, SaveError } from '../src/lib/save';
import { join } from './join';

globalThis.navigator ??= {};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const run = `${Date.now()}-p`;
const email = (who) => `${who}-${run}@example.com`;
const pw = { owner: 'owner-pass-1' };
const names = { owner: 'Kweku Annan', super: 'super person', manager: 'manager person' };
let cid, sid;
const as = async (who) => { await signOut(auth); const u = (await signInWithEmailAndPassword(auth, email(who), pw[who])).user; return { uid: u.uid, name: names[who] }; };
const site = async () => ({ id: sid, ...(await getDoc(siteDoc(cid, sid))).data() });
const list = async () => (await getDocs(milestonesQuery(cid, sid))).docs.map((d) => ({ id: d.id, ...d.data() }));

beforeAll(async () => {
  const { user } = await createUserWithEmailAndPassword(auth, email('owner'), pw.owner);
  await httpsCallable(functions, 'createCompany')({ companyName: 'Annan Homes', name: names.owner });
  cid = user.uid;
  const v = validate(siteInput, { name: 'Tamale house', location: 'Tamale', stage: 'Site clearing', budget: 400000, planStart: '2026-01-05', planEnd: '2026-10-30' });
  const r = createSite(cid, v.data); await r.done; sid = r.id;
  for (const [who, role] of [['super', 'supervisor'], ['manager', 'manager']]) {
    const res = await team.invite({ name: names[who], email: email(who), role, siteIds: role === 'supervisor' ? [sid] : [] });
    pw[who] = await join(res, `${who}-own-pass`);
  }
});
afterAll(async () => { await signOut(auth); await terminate(db); });

describe('setting up milestones', () => {
  it('a project manager starts from the standard building stages, spread over the plan', async () => {
    await as('manager');
    await save(addStandardMilestones(cid, await site()));
    const ms = await list();
    expect(ms.map((m) => m.name)).toEqual(STAGES);
    expect(ms[0].plannedStart).toBe('2026-01-05');
    expect(ms[ms.length - 1].plannedEnd).toBe('2026-10-30');
    expect((await site()).progress).toBe(0);
  });
  it('the supervisor cannot change the plan', async () => {
    await as('super');
    const [m] = await list();
    await expect(save(updateMilestonePlan(cid, sid, m.id, { name: 'X', weight: 9, plannedStart: '', plannedEnd: '' }, await list()))).rejects.toBeInstanceOf(SaveError);
  });
});

describe('updating progress', () => {
  it('the supervisor updates milestones and the site overall follows', async () => {
    const me = await as('super');
    let ms = await list();
    await save(setMilestoneProgress(cid, sid, ms[0], ms, { percentDone: 100, ...me }));
    ms = await list();
    await save(setMilestoneProgress(cid, sid, ms[1], ms, { percentDone: 50, ...me }));
    ms = await list();
    expect(ms[0]).toMatchObject({ status: 'done', percentDone: 100, updatedByName: names.super });
    expect(ms[0].actualEnd).toBeTruthy();
    expect(ms[1]).toMatchObject({ status: 'in_progress', percentDone: 50 });
    expect((await site()).progress).toBe(15); // (100 + 50) / 10 stages
  });
  it('weights change the overall; removing a milestone recalculates it', async () => {
    await as('manager');
    let ms = await list();
    await save(updateMilestonePlan(cid, sid, ms[0].id, { name: ms[0].name, weight: 6, plannedStart: ms[0].plannedStart, plannedEnd: ms[0].plannedEnd }, ms));
    expect((await site()).progress).toBe(43); // (6*100 + 1*50) / 15
    ms = await list();
    await save(deleteMilestone(cid, sid, ms[ms.length - 1].id, ms));
    expect((await list())).toHaveLength(STAGES.length - 1);
    expect((await site()).progress).toBe(46); // (600 + 50) / 14
  });
  it('order can be changed', async () => {
    await as('manager');
    const ms = await list();
    await save(swapMilestones(cid, sid, ms[2], ms[3]));
    const after = await list();
    expect(after[2].name).toBe(ms[3].name);
  });
  it('with milestones, a daily report records the progress but does not change it', async () => {
    const me = await as('super');
    const s = await site();
    await save(sendReport(cid, s, { text: 'Blockwork on east wall', stage: 'Blockwork', progress: 99, workersPresent: 6 }, { ...me, progressFromMilestones: true }).done);
    const after = await site();
    expect(after).toMatchObject({ progress: s.progress, stage: 'Blockwork' });
  });
  it('a new milestone counts straight away', async () => {
    await as('manager');
    await save(addMilestone(cid, sid, { name: 'External works', weight: 1, plannedStart: '', plannedEnd: '' }, await list()));
    expect((await site()).progress).toBe(43); // 650 / 15
  });
});

describe('planned against actual', () => {
  it('compares the milestones with the plan', async () => {
    await as('owner');
    const st = scheduleStatus(await site(), await list(), new Date('2026-06-15T12:00:00'));
    expect(st.actual).toBe(43);
    expect(['behind', 'on_track', 'ahead', 'no_plan']).toContain(st.state);
  });
});
