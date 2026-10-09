import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useExpenses, useQuery, useSiteSignals, useTitle } from '../lib/hooks';
import { companyDoc, companyReportsQuery, openIssuesQuery, sitesCol } from '../lib/db';
import {
  big, budgetUsedPct, cedi, getLocale, reportAuthor, costBreakdown, friendlyError, dailyTotals, isOn, longToday, materialStatus, plannedWeeklySpend, recentWorkDays,
  scheduleStatus, siteAlerts, siteFinanceSummary, todayKey, weeklySpend,
} from '@siteflow/shared';
import AlertsPanel from '../components/AlertsPanel';
import { GettingStarted, SampleBanner } from '../components/GettingStarted';
import { loadDemo } from '../lib/account';
import { toast } from '../lib/save';
import PageHead from '../components/PageHead';
import StatusPill from '../components/StatusPill';
import { Mark } from '../components/Brand';
import { CostDonut, Ring, Spark, SpendChart } from '../components/Charts';
import { ScheduleBadge } from '../components/ProgressPanel';
import { Empty, ErrorState, Loading } from '../components/States';

const PERIODS = [['today', 'Today', 1], ['week', 'This week', 6], ['month', 'This month', 26]]; // working days (Sundays off)
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return todayKey(d); };

// The owner's and manager's portfolio view: headline numbers, what needs attention, money, and each project
export default function Dashboard() {
  useTitle('Dashboard');
  const { cid, can } = useAuth();
  const nav = useNavigate();
  const [period, setPeriod] = useState('week');
  const today = todayKey();
  const { data: company } = useDoc(() => cid && companyDoc(cid), [cid]);
  const mod = (k) => isOn(company, k);
  const money = can('finance.view') && mod('budget');
  const { data: sites, loading, error } = useQuery(() => cid && sitesCol(cid), [cid]);
  const { data: openIssues } = useQuery(() => cid && openIssuesQuery(cid), [cid]);
  const monthAgo = ago(31);
  const { data: reports } = useQuery(() => cid && companyReportsQuery(cid, { from: monthAgo }, 500), [cid, monthAgo]);
  const active = sites.filter((s) => s.status !== 'closed');
  const ids = active.map((s) => s.id);
  const { materials, usage, present, finance, milestones, crew } = useSiteSignals(cid, ids, { withFinance: money });
  const weeksAgo = ago(8 * 7);
  const expenses = useExpenses(cid, ids, weeksAgo, money);

  if (loading) return <Loading what="projects" />;
  if (error) return <section className="wrap"><ErrorState error={error} what="your projects" onRetry={() => window.location.reload()} /></section>;
  if (!active.length) {
    return (
      <>
        <PageHead title="Portfolio dashboard" sub={`${company?.name || ''}${company ? ', ' : ''}${longToday()}`} />
        <div className="dpage"><FirstRun can={can} company={company} /></div>
      </>
    );
  }

  return (
    <Body {...{ can, nav, period, setPeriod, today, company, mod, money, active, openIssues, reports, materials, usage, present, finance, milestones, crew, expenses }} />
  );
}

function Body({ can, nav, period, setPeriod, today, company, mod, money, active, openIssues, reports, materials, usage, present, finance, milestones, crew, expenses }) {
  const [q, setQ] = useState('');
  const days = PERIODS.find((p) => p[0] === period)[2];
  const periodDays = recentWorkDays(days);
  const reporting = active.filter((s) => s.status === 'active');
  const issuesBySite = (sid) => openIssues.filter((i) => i.siteId === sid);
  const alerts = active.flatMap((s) => siteAlerts(s, materials[s.id], usage[s.id], {
    company, finance: money ? finance[s.id] : null, openIssues: issuesBySite(s.id), milestones: milestones[s.id] || [],
  }).map((a) => ({ ...a, site: s })));

  // Headline numbers
  const reportsIn = reporting.filter((s) => s.lastReportDate === today).length;
  const expected = reporting.length * periodDays.length;
  const inPeriod = new Set(periodDays);
  const sentInPeriod = new Set(reports.filter((r) => inPeriod.has(r.date)).map((r) => `${r.siteId}|${r.date}`)).size;
  const last8 = [...recentWorkDays(8)].reverse();
  const perDay = dailyTotals(reports, last8);
  const workers = active.reduce((n, s) => n + (present[s.id] || 0), 0);
  const crewAll = active.reduce((n, s) => n + (crew[s.id] || 0), 0);
  const critical = openIssues.filter((i) => i.priority === 'critical').length;
  const states = Object.fromEntries(active.map((s) => [s.id, scheduleStatus(s, milestones[s.id] || [])]));
  const behind = active.filter((s) => states[s.id].state === 'behind');
  const lowStock = active.reduce((n, s) => n + (materials[s.id] || []).filter((m) => m.active !== false && materialStatus(m, usage[s.id]?.[m.id]).low).length, 0);
  const budgetAll = active.reduce((n, s) => n + (finance[s.id]?.budget || 0), 0);
  const spentAll = active.reduce((n, s) => n + (finance[s.id]?.spent || 0), 0);
  const weeks = weeklySpend(expenses, 8);
  const plan = plannedWeeklySpend(active.map((s) => ({ budget: finance[s.id]?.budget, planStart: s.planStart, planEnd: s.planEnd })));
  const parts = costBreakdown(active.map((s) => finance[s.id]));
  const usedPct = budgetAll ? Math.round((spentAll / budgetAll) * 100) : 0;

  // Today on site: the latest reports in the chosen period, with their photos
  const feed = reports.filter((r) => inPeriod.has(r.date)).slice(0, period === 'today' ? 10 : 6);
  const siteById = Object.fromEntries(active.map((s) => [s.id, s]));
  const thumbFor = (sid) => reports.find((r) => r.siteId === sid && (r.thumbs?.[0] || r.photos?.[0]));
  const matches = q.trim() ? active.filter((s) => [s.name, s.location, s.stage, s.foremanName].join(' ').toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];

  return (
    <>
      <PageHead title="Portfolio dashboard" sub={`${company?.name || ''}${company ? ', ' : ''}${longToday()}`}>
        <div className="search" role="search">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="7" cy="7" r="5" /><path d="m11 11 3.5 3.5" /></svg>
          <input type="search" placeholder="Search projects, locations, foremen" aria-label="Search projects" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) nav(`/sites/${matches[0].id}`); if (e.key === 'Escape') setQ(''); }} />
          {!!q.trim() && (
            <ul className="search-results">
              {matches.length ? matches.map((s) => <li key={s.id}><Link to={`/sites/${s.id}`}><b>{s.name}</b><small>{s.location} · {s.stage}</small></Link></li>)
                : <li className="muted small" style={{ padding: '8px 10px' }}>No project matches "{q}".</li>}
            </ul>
          )}
        </div>
        <div className="period" role="group" aria-label="Period">
          {PERIODS.map(([k, l]) => <button key={k} type="button" aria-pressed={period === k} onClick={() => setPeriod(k)}>{l}</button>)}
        </div>
        <a className="iconbtn" href="#attention" aria-label={`${alerts.length} item${alerts.length === 1 ? '' : 's'} need your attention`}
          onClick={(e) => { e.preventDefault(); const el = document.getElementById('attention'); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); el?.focus({ preventScroll: true }); }}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 11V7a4 4 0 0 1 8 0v4l1.5 2h-11z" /><path d="M6.5 14.5a1.6 1.6 0 0 0 3 0" /></svg>
          {!!alerts.length && <span className="badge">{alerts.length}</span>}
        </a>
        {can('sites.manage') && <Link to="/sites/new" className="btn gold">New project</Link>}
      </PageHead>

      <div className="dpage">
        {active.some((s) => s.sample) && <SampleBanner />}
        <GettingStarted company={company} sites={active} budgetSet={money ? active.some((s) => !s.sample && finance[s.id]?.budget > 0) : null} />
        <dl className="tiles">
          {money && (
            <>
              <div className="tile"><dt>Portfolio value</dt><dd>{big(budgetAll)}</dd>
                <div className="foot"><span className="delta nt">{active.length} active project{active.length === 1 ? '' : 's'}</span></div></div>
              <div className="tile"><dt>Spent to date</dt><dd>{big(spentAll)}</dd>
                <div className="foot"><span className={`delta ${usedPct >= 90 ? 'dn' : usedPct > 70 ? 'nt' : 'up'}`}>{budgetAll ? `${usedPct}% of budget` : 'No budget'}</span><Spark data={weeks.map((w) => w.total)} /></div></div>
            </>
          )}
          <div className="tile"><dt>Daily reports</dt>
            <dd>{period === 'today' ? reportsIn : sentInPeriod}<small> of {period === 'today' ? reporting.length : expected}</small></dd>
            <div className="foot">
              {period === 'today'
                ? <span className={`delta ${reportsIn < reporting.length ? 'dn' : 'up'}`}>{reportsIn < reporting.length ? `${reporting.length - reportsIn} outstanding` : 'All in'}</span>
                : <span className={`delta ${expected && sentInPeriod / expected < 0.7 ? 'dn' : 'up'}`}>{expected ? `${Math.round((sentInPeriod / expected) * 100)}% sent` : 'None expected'}</span>}
              <Spark data={perDay.map((d) => d.reports)} color="var(--ok)" />
            </div></div>
          {mod('labour') && (
            <div className="tile"><dt>Workforce today</dt><dd>{workers}<small> of {crewAll}</small></dd>
              <div className="foot"><span className="delta up">{crewAll ? `${Math.round((workers / crewAll) * 100)}% on site` : 'No crews yet'}</span><Spark data={perDay.map((d) => d.workers)} color="var(--c-done)" /></div></div>
          )}
          <div className="tile"><dt>Open issues</dt><dd><Link to="/issues">{openIssues.length}</Link></dd>
            <div className="foot"><span className={`delta ${critical ? 'dn' : 'up'}`}>{critical ? `${critical} critical` : 'None critical'}</span></div></div>
        </dl>

        <dl className="tiles mtiles">
          <div className="tile"><dt>Programme</dt><dd>{behind.length ? `${behind.length} behind` : 'On time'}</dd>
            <div className="foot"><span className={`delta ${behind.length ? 'dn' : 'up'}`}>{behind.length ? behind.map((s) => s.name.split(' ')[0]).join(', ') : 'No project behind plan'}</span></div></div>
          {mod('materials') && (
            <div className="tile"><dt>Materials to reorder</dt><dd>{lowStock}</dd>
              <div className="foot"><span className={`delta ${lowStock ? 'nt' : 'up'}`}>{lowStock ? 'Below reorder level' : 'Stock levels fine'}</span></div></div>
          )}
          <div className="tile"><dt>On hold</dt><dd>{active.length - reporting.length}</dd>
            <div className="foot"><span className="delta nt">Not chased for reports</span></div></div>
        </dl>

        <div className="dgrid">
          {money && (
            <>
              <section className="panel c8">
                <div className="panel-h">
                  <div><h2>Weekly spend against plan</h2><p>All projects, last 8 weeks.{plan ? ' Red bars ran more than 10% over plan.' : ' Add planned dates to projects to see the plan line.'}</p></div>
                  <span className="count">{big(weeks.reduce((n, w) => n + w.total, 0))}</span>
                </div>
                <SpendChart weeks={weeks} plan={plan} />
              </section>
              <section className="panel c4">
                <div className="panel-h"><div><h2>Where the money goes</h2><p>Spending by category to date</p></div></div>
                {parts.length ? <CostDonut parts={parts} /> : <p className="empty mt-sm">No spending recorded yet.</p>}
              </section>
            </>
          )}

          <AlertsPanel alerts={alerts} className={money ? 'c7' : 'c12'} />

          {money && (
            <section className="panel c5" aria-labelledby="bvp-h">
              <div className="panel-h"><div><h2 id="bvp-h">Budget against progress</h2><p>Money should not run ahead of the work</p></div></div>
              <div className="legend2"><span><i style={{ background: 'var(--c-done)' }} />Work done</span><span><i style={{ background: 'var(--brass)' }} />Budget used</span></div>
              <div className="bvp">
                {active.map((s) => {
                  const f = finance[s.id];
                  const fs = siteFinanceSummary(f, s.progress || 0);
                  const b = f ? budgetUsedPct(f) : 0;
                  return (
                    <div className="bvp-row" key={s.id}>
                      <div className="row-between"><b>{s.name}</b>{!f?.budget ? <span className="pill">No budget</span> : fs.overspendRisk ? <span className="pill bad">Overspend risk</span> : <span className="pill ok">On track</span>}</div>
                      <div className="meter work"><span style={{ width: `${s.progress || 0}%` }} /></div>
                      <div className={`meter ${fs.overspendRisk ? 'hot' : ''}`}><span style={{ width: `${Math.min(b, 100)}%` }} /></div>
                      <div className="bvp-lab"><span>{s.progress || 0}% built</span><span>{f?.budget ? `${b}% of ${big(f.budget)} spent` : 'Set a budget under Budget'}</span></div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="panel c12">
            <div className="panel-h">
              <div><h2>Projects</h2><p>Select a row for reports, materials, labour and budget</p></div>
              {can('sites.manage') && <Link to="/sites/new" className="btn ghost sm">Add project</Link>}
            </div>
            <div className="scroll flush"><table className="ptable">
              <thead><tr>
                <th>Project</th><th>Stage</th><th>Progress</th>{money && <><th>Budget used</th><th>Spent</th></>}<th>Today's report</th>
                {mod('labour') && <th>On site</th>}<th>Open issues</th>
              </tr></thead>
              <tbody>
                {active.map((s) => {
                  const st = states[s.id];
                  const f = finance[s.id];
                  const b = f ? budgetUsedPct(f) : 0;
                  const pic = thumbFor(s.id);
                  const iss = issuesBySite(s.id);
                  return (
                    <tr key={s.id} className="row" onClick={() => nav(`/sites/${s.id}`)}>
                      <td><div className="pcell">
                        <span className="pthumb">{pic ? <img src={pic.thumbs?.[0] || pic.photos[0]} alt="" loading="lazy" /> : <Mark />}</span>
                        <div><Link className="sname" to={`/sites/${s.id}`} onClick={(e) => e.stopPropagation()}>{s.name}</Link> {s.sample && <span className="pill sample">Sample</span>} {s.status !== 'active' && <StatusPill status={s.status} />}
                          <div className="muted small">{s.location}</div></div>
                      </div></td>
                      <td>{s.stage}</td>
                      <td><div className="pcell"><Ring pct={st.actual} size={40} /><ScheduleBadge st={st} /></div></td>
                      {money && (
                        <>
                          <td>{f?.budget ? <><div className={`mbar ${b >= 90 ? 'hot' : ''}`}><span style={{ width: `${Math.min(b, 100)}%` }} /></div><span className={`small ${b >= 90 ? 'badt' : 'muted'}`}>{b}%</span></> : <span className="muted">–</span>}</td>
                          <td>{f ? <>{big(f.spent || 0)} {f.budget ? <span className="muted small">of {big(f.budget)}</span> : null}</> : '–'}</td>
                        </>
                      )}
                      <td>{s.lastReportDate === today ? <span className="pill ok">Sent {s.lastReportTime}</span> : s.status !== 'active' ? <span className="muted">–</span> : <span className="pill bad">Missing</span>}</td>
                      {mod('labour') && <td>{present[s.id] || 0} / {crew[s.id] || 0}</td>}
                      <td>{iss.length ? <Link to={`/sites/${s.id}?tab=issues`} onClick={(e) => e.stopPropagation()}>{iss.length}</Link> : <span className="muted">0</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </section>

          {mod('labour') && (
            <section className="panel c5">
              <div className="panel-h"><div><h2>Workforce by project</h2><p>Present today against crew size</p></div></div>
              <div className="hbars">
                {active.map((s) => (
                  <div key={s.id}>
                    <div className="l"><span>{s.name}</span><b>{present[s.id] || 0} / {crew[s.id] || 0}</b></div>
                    <div className="t"><span style={{ width: `${crew[s.id] ? Math.min(100, ((present[s.id] || 0) / crew[s.id]) * 100) : 0}%` }} /></div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className={`panel ${mod('labour') ? 'c7' : 'c12'}`}>
            <div className="panel-h"><div><h2>{period === 'today' ? 'Today on site' : 'Latest from site'}</h2><p>Latest daily reports{period === 'today' ? '' : `, ${period === 'week' ? 'this week' : 'this month'}`}</p></div>
              <Link to="/reports" className="btn ghost sm">All reports</Link></div>
            {feed.length ? (
              <div className="sfeed">
                {feed.map((r) => (
                  <article key={`${r.siteId}-${r.id}`}>
                    <Ring pct={siteById[r.siteId]?.progress ?? r.progress ?? 0} size={46} />
                    <div>
                      <p className="when"><Link to={`/reports/${r.siteId}/${r.id}`}>{r.siteName}</Link>, {r.date === today ? `sent ${r.time}` : `${r.date.slice(8)}/${r.date.slice(5, 7)} at ${r.time}`} by {reportAuthor(r)}</p>
                      <p className="mt-sm">{r.text}</p>
                      {r.issues && <p className="issue">{r.issues}</p>}
                      {!!(r.thumbs?.length || r.photos?.length) && (
                        <div className="thumbs">{(r.thumbs?.length ? r.thumbs : r.photos).slice(0, 4).map((u, i) => <img key={u} src={u} alt={`${r.siteName} photo ${i + 1}`} loading="lazy" />)}</div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : <p className="empty mt-sm">{period === 'today' ? 'No reports yet today.' : 'No reports in this period.'}</p>}
          </section>
        </div>
        {money && spentAll > 0 && <p className="hint mt">Figures in {getLocale().currency}. Spending comes from recorded expenses ({cedi(spentAll)} in total across active projects).</p>}
      </div>
    </>
  );
}

// No projects yet: a proper welcome, with the two ways to start
function FirstRun({ can, company }) {
  const [busy, setBusy] = useState(false);
  async function demo() {
    setBusy(true);
    try { await loadDemo(); toast('Sample projects added. Remove them any time with the button at the top of the dashboard.'); }
    catch (e) { toast(friendlyError(e), 'err'); }
    finally { setBusy(false); }
  }
  if (!can('sites.manage')) {
    return <Empty title="No projects yet.">A manager adds projects. They will appear here.</Empty>;
  }
  return (
    <div className="firstrun">
      <h2>Welcome{company?.name ? `, ${company.name}` : ''}</h2>
      <p className="muted">Start with a real project, or look around with sample projects first.</p>
      <div className="choices">
        <Link to="/sites/new" className="choice"><b>Add your first project</b><span>Name, location, type of work, foreman and budget. About two minutes.</span></Link>
        {can('company.settings') && (
          <button type="button" className="choice" onClick={demo} disabled={busy}>
            <b>{busy ? 'Adding sample projects… about 20 seconds' : 'Explore with sample data'}</b>
            <span>Three sample projects (a house, an office block and a road job) with six weeks of reports, photos, workers, materials and spending. Labelled Sample, never send messages, removed in one click.</span>
          </button>
        )}
        {can('company.settings') && <Link to="/welcome" className="choice"><b>Set up step by step</b><span>Company details, features and your team, then your first project.</span></Link>}
      </div>
    </div>
  );
}
