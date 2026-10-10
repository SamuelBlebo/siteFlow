import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import {
  OVERVIEW_SYSTEM, can, companyLocale, isOn, materialStatus, materialsUsed, overviewPrompt, paths, plainOverview, presentCount, reportAuthor,
  reportDay, scheduleStatus, todayKey, usageByMaterial,
  type Company, type Issue, type Material, type MaterialLog, type Milestone, type OverviewFacts, type OverviewKind, type Report, type Site,
} from '@siteflow/shared';
import { actorOf } from './members';
import { checkLimit } from './limits';

// AI overviews (SiteFlow AI module): a written summary of a project, or of its day, by Claude from
// the project's own records. Without an Anthropic key (ANTHROPIC_API_KEY set to "none") the same
// facts are written as plain sentences. Results are kept in sites/{sid}/ai/{kind}-{audience}, which no
// app can read directly, and only rewritten when the facts change or someone presses Refresh.

export const AI_KEY = defineSecret('ANTHROPIC_API_KEY');
const AI_MODEL = process.env.AI_MODEL ?? 'claude-sonnet-5-5';
const callOpts = { enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true', secrets: [AI_KEY], timeoutSeconds: 60 };
const apiKey = () => { try { const v = AI_KEY.value().trim(); return v.toLowerCase() === 'none' ? '' : v; } catch { return ''; } };
const DAY = 86400000;
const daysAgo = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) - n * DAY).toISOString().slice(0, 10);
const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// Everything the overview may say, gathered from the project's records
export async function overviewFacts(db: Firestore, company: Company, site: Site & { id: string }, kind: OverviewKind, withMoney: boolean): Promise<OverviewFacts> {
  const cid = company.id;
  const sid = site.id;
  const loc = companyLocale(company);
  const today = todayKey(new Date(), loc.timeZone);
  const sub = (name: Parameters<typeof paths.sub>[2]) => db.collection(paths.sub(cid, sid, name));
  const [msSnap, repSnap, issueSnap] = await Promise.all([
    sub('milestones').orderBy('order').get(),
    sub('reports').where('date', '>=', daysAgo(today, kind === 'project' ? 7 : 0)).orderBy('date', 'desc').limit(kind === 'project' ? 10 : 5).get(),
    sub('issues').where('status', 'in', ['open', 'in_progress']).limit(30).get(),
  ]);
  const milestones = msSnap.docs.map((d) => d.data() as Milestone);
  const st = scheduleStatus(site, milestones);
  const materialsOn = isOn(company, 'materials');
  let materials: Material[] = []; let logs: MaterialLog[] = [];
  if (materialsOn) {
    const [m, l] = await Promise.all([sub('materials').get(), sub('materialLogs').where('date', '==', today).get()]);
    materials = m.docs.map((d) => ({ id: d.id, ...d.data() }) as Material).filter((x) => x.active !== false);
    logs = l.docs.map((d) => d.data() as MaterialLog);
  }
  const usage = usageByMaterial(logs);
  const workersToday = isOn(company, 'labour') ? presentCount((await db.doc(paths.attendance(cid, sid, today)).get()).data()?.marks) : null;
  const fin = withMoney ? (await db.doc(paths.finance(cid, sid)).get()).data() : null;
  return {
    kind, date: today, currency: loc.currency,
    project: {
      name: site.name, location: site.location, ...(site.client?.name ? { client: site.client.name } : {}), status: site.status, stage: site.stage,
      progress: Math.round(st.actual), planned: st.planned == null ? null : Math.round(st.planned), schedule: st.state, weeksBehind: st.weeksBehind,
      planEnd: site.planEnd ?? null,
    },
    stages: milestones.map((m) => ({ name: m.name, pct: Math.round(m.percentDone || 0), plannedEnd: m.plannedEnd ?? null, late: !!m.plannedEnd && m.plannedEnd < today && m.status !== 'done' })),
    reports: repSnap.docs.map((d) => d.data() as Report & { createdByRole?: string }).map((r) => ({
      date: r.date, time: r.time, by: reportAuthor(r), work: clip(r.text, 500), issues: clip(r.issues, 300), workers: r.workersPresent, ...(r.weather ? { weather: r.weather } : {}),
    })),
    todayReport: reportDay(site, today),
    workersToday,
    materialsUsedToday: materialsUsed(logs).map((m) => ({ name: m.name, qty: m.qty, unit: m.unit })),
    lowStock: materials.filter((m) => materialStatus(m, usage[m.id] || 0).low).map((m) => ({ name: m.name, stock: m.stock, unit: m.unit })),
    openIssues: issueSnap.docs.map((d) => d.data() as Issue).map((i) => ({
      title: clip(i.title, 120), priority: i.priority, status: i.status, assignedTo: i.assignedToName || 'nobody',
      ageDays: Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${i.date}T00:00:00Z`)) / DAY)),
    })).sort((a, b) => ['critical', 'high', 'medium', 'low'].indexOf(a.priority) - ['critical', 'high', 'medium', 'low'].indexOf(b.priority)),
    money: fin ? { budget: fin.budget || 0, spent: fin.spent || 0 } : null,
  };
}

// Claude writes the overview; null if it can't (no key, network, refusal), so the plain one is used
async function writeWithClaude(facts: OverviewFacts): Promise<string | null> {
  const key = apiKey();
  if (!key || process.env.FUNCTIONS_EMULATOR === 'true') return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 500, system: OVERVIEW_SYSTEM, messages: [{ role: 'user', content: overviewPrompt(facts) }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) { logger.warn('AI overview: Claude refused', { status: res.status, body: (await res.text()).slice(0, 300) }); return null; }
    const j = await res.json() as { content?: { type: string; text?: string }[] };
    const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
    return text || null;
  } catch (e) {
    logger.warn('AI overview: Claude not reached', { error: String(e) });
    return null;
  }
}

export const aiOverview = onCall(callOpts, async (req) => {
  const siteId = req.data?.siteId;
  const kind: OverviewKind = req.data?.kind === 'today' ? 'today' : 'project';
  if (typeof siteId !== 'string' || !siteId || siteId.length > 128) throw new HttpsError('invalid-argument', 'Which project?');
  const db = getFirestore();
  const me = await actorOf(db, req.auth?.uid);
  const cid = me.companyId;
  if (!can(me.role, 'sites.all') && !(me.siteIds || []).includes(siteId)) throw new HttpsError('permission-denied', 'You are not on this project.');
  const company = { id: cid, ...(await db.doc(paths.company(cid)).get()).data() } as Company;
  if (!isOn(company, 'ai')) throw new HttpsError('failed-precondition', 'SiteFlow AI is switched off. The owner can switch it on under Modules.');
  const siteSnap = await db.doc(paths.site(cid, siteId)).get();
  if (!siteSnap.exists) throw new HttpsError('not-found', 'That project was not found.');
  const site = { id: siteId, ...siteSnap.data() } as Site & { id: string };

  // People who can see money get the version that mentions it; everyone else never does
  const withMoney = can(me.role, 'finance.view') && isOn(company, 'budget');
  const facts = await overviewFacts(db, company, site, kind, withMoney);
  const stamp = createHash('sha256').update(JSON.stringify(facts)).digest('hex').slice(0, 24);
  const ref = db.doc(`${paths.site(cid, siteId)}/ai/${kind}-${withMoney ? 'money' : 'plain'}`);
  const cached = (await ref.get()).data();
  const refresh = req.data?.refresh === true;
  if (cached && cached.stamp === stamp && !refresh) {
    return { text: cached.text, source: cached.source, generatedAt: cached.generatedAt?.toMillis?.() ?? null, cached: true };
  }
  await checkLimit(me.id, 'ai');
  const ai = await writeWithClaude(facts);
  const text = ai ?? plainOverview(facts);
  const source = ai ? 'ai' : 'plain';
  await ref.set({ text, source, stamp, kind, model: ai ? AI_MODEL : null, generatedAt: FieldValue.serverTimestamp() });
  logger.info('AI overview written', { cid, siteId, kind, source });
  return { text, source, generatedAt: Date.now(), cached: false };
});
