import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useQuery } from '../lib/hooks';
import {
  addMilestone, addStandardMilestones, deleteMilestone, milestonesQuery, setMilestoneProgress, siteReportsQuery, swapMilestones, updateMilestonePlan,
} from '../lib/db';
import { save, toast } from '../lib/save';
import {
  MILESTONE_STATUS_LABELS, PROGRESS_STEPS, SCHEDULE_LABELS, milestoneInput, overdueMilestones, plannedProgress, prettyDate, progressSeries,
  WORK_TYPES, scheduleStatus, stagesFor, todayKey, validate, workTypeOf,
} from '@siteflow/shared';
import { Empty, ErrorState, Loading } from './States';

export const ScheduleBadge = ({ st }) => {
  const kind = { behind: 'bad', ahead: 'ok', on_track: 'ok', finished: 'ok', no_plan: '' }[st.state];
  return <span className={`pill ${kind}`}>{SCHEDULE_LABELS[st.state]}{st.state === 'behind' && st.weeksBehind ? ` ${st.weeksBehind} wk` : ''}</span>;
};

// Progress for one site: where it is against the plan, the chart, and its milestones
export default function ProgressPanel({ cid, site, canWork }) {
  const { can } = useAuth();
  const manage = can('sites.manage');
  const { data: milestones, loading, error } = useQuery(() => cid && milestonesQuery(cid, site.id), [cid, site.id]);
  const { data: reports } = useQuery(() => cid && siteReportsQuery(cid, site.id, 300), [cid, site.id]);
  if (loading) return <Loading what="progress" />;
  if (error) return <ErrorState error={error} what="progress" />;
  const st = scheduleStatus(site, milestones);
  const overdue = overdueMilestones(milestones, todayKey());

  return (
    <>
      <dl className="cols">
        <div><dt>Done</dt><dd>{st.actual}%</dd></div>
        <div><dt>Planned by today</dt><dd>{st.planned == null ? '–' : `${st.planned}%`}</dd></div>
        <div><dt>Against the plan</dt><dd><ScheduleBadge st={st} /></dd></div>
        <div><dt>Planned finish</dt><dd>{site.planEnd ? prettyDate(site.planEnd) : '–'}</dd></div>
      </dl>
      {st.state === 'behind' && <p className="notice warn">{st.actual}% done against {st.planned}% planned{st.weeksBehind ? `, about ${st.weeksBehind} week${st.weeksBehind === 1 ? '' : 's'} behind` : ''}.</p>}
      {!!overdue.length && <p className="notice warn">Overdue: {overdue.map((m) => m.name).join(', ')}.</p>}
      {st.state === 'no_plan' && <p className="hint">Add planned dates to the site (Settings) or to the milestones to compare progress with the plan.</p>}

      <Chart site={site} milestones={milestones} reports={reports} actual={st.actual} />

      <h3 className="sub">Milestones</h3>
      {!milestones.length ? (
        <>
          <Empty title="No milestones yet.">{manage ? 'Add your own below, or start from the usual stages for this kind of work.' : 'A project manager sets up the milestones.'} Until then, progress comes from the daily reports.</Empty>
          {manage && <StageTemplate cid={cid} site={site} />}
        </>
      ) : <MilestoneList cid={cid} site={site} milestones={milestones} canWork={canWork} manage={manage} />}
      {manage && <AddMilestone cid={cid} sid={site.id} all={milestones} />}
    </>
  );
}

function MilestoneList({ cid, site, milestones, canWork, manage }) {
  const { user, profile } = useAuth();
  const [editing, setEditing] = useState(null);
  const today = todayKey();
  const setPct = async (m, pct) => {
    try { await save(setMilestoneProgress(cid, site.id, m, milestones, { percentDone: pct, uid: user.uid, name: profile.name }), `${m.name} progress`); }
    catch (e) { toast(e.message, 'err'); }
  };
  const run = async (p, label) => { try { await save(p, label); } catch (e) { toast(e.message, 'err'); } };

  return (
    <ul className="list">
      {milestones.map((m, i) => (
        <li key={m.id}>
          {editing === m.id ? <EditMilestone cid={cid} sid={site.id} m={m} all={milestones} onDone={() => setEditing(null)} /> : (
            <div className="it milestone">
              <span className="grow">
                <b>{m.name}</b>{' '}
                <span className={`pill ${m.status === 'done' ? 'ok' : m.plannedEnd && m.plannedEnd < today ? 'bad' : m.status === 'in_progress' ? 'warn' : ''}`}>
                  {m.status !== 'done' && m.plannedEnd && m.plannedEnd < today ? 'Overdue' : MILESTONE_STATUS_LABELS[m.status]}
                </span>
                <small>
                  Planned {m.plannedStart ? prettyDate(m.plannedStart) : '?'} to {m.plannedEnd ? prettyDate(m.plannedEnd) : '?'}
                  {m.actualStart ? `. Started ${prettyDate(m.actualStart)}` : ''}{m.actualEnd ? `, finished ${prettyDate(m.actualEnd)}` : ''}
                  {m.weight && m.weight !== 1 ? `. Weight ${m.weight}` : ''}{m.updatedByName ? `. Last update by ${m.updatedByName}` : ''}
                </small>
                <span className="meter mt-sm"><span style={{ width: `${m.percentDone}%` }} /></span>
              </span>
              <span className="ms-actions">
                <b>{m.percentDone}%</b>
                {canWork && (
                  <span className="seg" role="group" aria-label={`${m.name} progress`}>
                    {PROGRESS_STEPS.map((p) => <button key={p} type="button" aria-pressed={m.percentDone === p} onClick={() => m.percentDone !== p && setPct(m, p)}>{p === 100 ? 'Done' : `${p}%`}</button>)}
                  </span>
                )}
                {manage && (
                  <span>
                    <button type="button" className="btn sm ghost" disabled={i === 0} aria-label={`Move ${m.name} up`} onClick={() => run(swapMilestones(cid, site.id, m, milestones[i - 1]), 'Order')}>↑</button>
                    <button type="button" className="btn sm ghost" disabled={i === milestones.length - 1} aria-label={`Move ${m.name} down`} onClick={() => run(swapMilestones(cid, site.id, m, milestones[i + 1]), 'Order')}>↓</button>
                    <button type="button" className="btn sm ghost" onClick={() => setEditing(m.id)}>Edit</button>
                  </span>
                )}
              </span>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

const planForm = (f, set, prefix) => (
  <div className="grid3">
    <div className="field"><label htmlFor={`${prefix}-n`}>Milestone</label><input id={`${prefix}-n`} value={f.name} onChange={set('name')} placeholder="e.g. Roofing" /></div>
    <div className="field"><label htmlFor={`${prefix}-s`}>Planned start</label><input id={`${prefix}-s`} type="date" value={f.plannedStart} onChange={set('plannedStart')} /></div>
    <div className="field"><label htmlFor={`${prefix}-e`}>Planned finish</label><input id={`${prefix}-e`} type="date" value={f.plannedEnd} onChange={set('plannedEnd')} /></div>
    <div className="field"><label htmlFor={`${prefix}-w`}>Weight</label><input id={`${prefix}-w`} type="number" min="0.1" step="any" value={f.weight} onChange={set('weight')} />
      <p className="hint">How big this part is compared with the others (1 = average).</p></div>
  </div>
);

function AddMilestone({ cid, sid, all }) {
  const blank = { name: '', weight: 1, plannedStart: '', plannedEnd: '' };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    const v = validate(milestoneInput, f);
    if (!v.ok) return setErr(v.error);
    try { await save(addMilestone(cid, sid, v.data, all), 'Milestone'); setF(blank); setErr(''); } catch (e2) { setErr(e2.message); }
  }
  return (
    <form className="form inline" onSubmit={submit}>
      <h3>Add a milestone</h3>
      {err && <p className="err" role="alert">{err}</p>}
      {planForm(f, set, 'am')}
      <button type="submit" className="btn ghost">Add milestone</button>
    </form>
  );
}

function EditMilestone({ cid, sid, m, all, onDone }) {
  const [f, setF] = useState({ name: m.name, weight: m.weight ?? 1, plannedStart: m.plannedStart || '', plannedEnd: m.plannedEnd || '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    const v = validate(milestoneInput, f);
    if (!v.ok) return setErr(v.error);
    try { await save(updateMilestonePlan(cid, sid, m.id, v.data, all), 'Milestone'); onDone(); } catch (e2) { setErr(e2.message); }
  }
  async function remove() {
    if (!window.confirm(`Remove the milestone "${m.name}"? Overall progress is worked out again from the others.`)) return;
    try { await save(deleteMilestone(cid, sid, m.id, all), 'Milestone'); onDone(); } catch (e2) { setErr(e2.message); }
  }
  return (
    <form className="form compact" onSubmit={submit}>
      {err && <p className="err" role="alert">{err}</p>}
      {planForm(f, set, `em-${m.id}`)}
      <div className="actions">
        <button type="submit" className="btn">Save</button>
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
        <button type="button" className="btn ghost danger" onClick={remove}>Remove</button>
      </div>
    </form>
  );
}

// Planned progress (line) against reported progress (dots), from the plan start to its finish
function Chart({ site, milestones, reports, actual }) {
  const series = progressSeries(reports);
  const dates = [site.planStart, site.planEnd, ...milestones.flatMap((m) => [m.plannedStart, m.plannedEnd]), ...series.map((p) => p.date)].filter(Boolean).sort();
  if (dates.length < 2 && series.length < 2) return null;
  const today = todayKey();
  const start = dates[0];
  const end = [dates[dates.length - 1], today].sort()[1];
  const ms = (d) => Date.parse(`${d}T12:00:00`);
  const W = 640, H = 220, L = 36, B = 24, T = 10, R = 10;
  const x = (d) => L + ((ms(d) - ms(start)) / Math.max(1, ms(end) - ms(start))) * (W - L - R);
  const y = (p) => T + (1 - p / 100) * (H - T - B);
  const samples = 40;
  const planned = [];
  for (let i = 0; i <= samples; i++) {
    const d = new Date(ms(start) + ((ms(end) - ms(start)) * i) / samples);
    const p = plannedProgress(site, milestones, d);
    if (p != null) planned.push([x(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`), y(p)]);
  }
  const actualPts = [...series.map((p) => [x(p.date), y(p.progress)])];
  if (milestones.length) actualPts.push([x(today), y(actual)]);

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Planned against actual progress from ${prettyDate(start)} to ${prettyDate(end)}. Now ${actual}% done.`}>
        {[0, 25, 50, 75, 100].map((p) => (
          <g key={p}><line x1={L} x2={W - R} y1={y(p)} y2={y(p)} className="grid" /><text x={L - 6} y={y(p) + 4} textAnchor="end">{p}%</text></g>
        ))}
        <line x1={x(today)} x2={x(today)} y1={T} y2={H - B} className="today" />
        <text x={x(today)} y={H - 6} textAnchor="middle">Today</text>
        {planned.length > 1 && <polyline points={planned.map((p) => p.join(',')).join(' ')} className="planned" />}
        {actualPts.length > 1 && <polyline points={actualPts.map((p) => p.join(',')).join(' ')} className="actual" />}
        {actualPts.map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="3.5" className="actual-dot" />)}
      </svg>
      <figcaption><span className="key planned" /> Planned <span className="key actual" /> Actual (from daily reports{milestones.length ? ' and milestones' : ''})</figcaption>
    </figure>
  );
}

// Start the milestones from the usual stages of a kind of work (the site's, unless changed here)
function StageTemplate({ cid, site }) {
  const kinds = WORK_TYPES.filter((w) => w.stages.length);
  const [type, setType] = useState(() => { const t = workTypeOf(site.stage); return stagesFor(t).length ? t : 'building'; });
  async function use() {
    try { await save(addStandardMilestones(cid, site, stagesFor(type)), 'Milestones'); toast('Standard stages added. Adjust their dates and weights as needed.'); } catch (e) { toast(e.message, 'err'); }
  }
  return (
    <div className="actions mt-sm">
      <select id="ms-tpl" aria-label="Kind of work" className="inline-select" value={type} onChange={(e) => setType(e.target.value)}>
        {kinds.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
      </select>
      <button type="button" className="btn" onClick={use}>Use these standard stages</button>
    </div>
  );
}
