import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useExpenses, useQuery, useSiteSignals, useTitle } from '../lib/hooks';
import { companyDoc, companyReportsQuery, openIssuesQuery, sitesCol } from '../lib/db';
import {
  big, cedi, getLocale, friendlyError, dailyTotals, isOn, longToday, recentWorkDays,
  reportDay, reportDue, scheduleStatus, siteAlerts, siteFinanceSummary, todayKey, weeklySpend,
} from '@siteflow/shared';
import AlertsPanel from '../components/AlertsPanel';
import { GettingStarted, SampleBanner } from '../components/GettingStarted';
import { loadDemo } from '../lib/account';
import { toast } from '../lib/save';
import PageHead from '../components/PageHead';
import { Spark } from '../components/Charts';
import ProjectCover from '../components/ProjectCover';
import OwnSpaceCard from '../components/OwnSpaceCard';
import { Empty, ErrorState, Loading } from '../components/States';
import Choice from '../components/Choice';
import SearchBox from '../components/SearchBox';

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
  // Only days that need a report count (working days not skipped)
  const dueToday = reporting.filter((s) => ['sent', 'due'].includes(reportDay(s, today)));
  const reportsIn = dueToday.filter((s) => s.lastReportDate === today).length;
  const expected = reporting.reduce((n, s) => n + periodDays.filter((d) => reportDue(s, d) || reports.some((r) => r.siteId === s.id && r.date === d)).length, 0);
  const inPeriod = new Set(periodDays);
  const sentInPeriod = new Set(reports.filter((r) => inPeriod.has(r.date)).map((r) => `${r.siteId}|${r.date}`)).size;
  const last8 = [...recentWorkDays(8)].reverse();
  const perDay = dailyTotals(reports, last8);
  const critical = openIssues.filter((i) => i.priority === 'critical').length;
  const states = Object.fromEntries(active.map((s) => [s.id, scheduleStatus(s, milestones[s.id] || [])]));
  const budgetAll = active.reduce((n, s) => n + (finance[s.id]?.budget || 0), 0);
  const spentAll = active.reduce((n, s) => n + (finance[s.id]?.spent || 0), 0);
  const weeks = weeklySpend(expenses, 8);
  const usedPct = budgetAll ? Math.round((spentAll / budgetAll) * 100) : 0;

  const matches = q.trim() ? active.filter((s) => [s.name, s.location, s.stage, s.foremanName].join(' ').toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];

  return (
    <>
      <PageHead title="Portfolio dashboard" sub={`${company?.name || ''}${company ? ', ' : ''}${longToday()}`}>
        <SearchBox value={q} onChange={setQ} placeholder="Search projects, locations, foremen" label="Search projects"
          onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) nav(`/sites/${matches[0].id}`); if (e.key === 'Escape') setQ(''); }}>
          {!!q.trim() && (
            <ul className="search-results">
              {matches.length ? matches.map((s) => <li key={s.id}><Link to={`/sites/${s.id}`}><b>{s.name}</b><small>{s.location} · {s.stage}</small></Link></li>)
                : <li className="muted small" style={{ padding: '8px 10px' }}>No project matches "{q}".</li>}
            </ul>
          )}
        </SearchBox>
        <Choice className="period" label="Period" value={period} onChange={setPeriod} options={PERIODS.map(([value, label]) => ({ value, label }))} />
        <a className="iconbtn" href="#attention" aria-label={`${alerts.length} item${alerts.length === 1 ? '' : 's'} need your attention`}
          onClick={(e) => { e.preventDefault(); const el = document.getElementById('attention'); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); el?.focus({ preventScroll: true }); }}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 11V7a4 4 0 0 1 8 0v4l1.5 2h-11z" /><path d="M6.5 14.5a1.6 1.6 0 0 0 3 0" /></svg>
          {!!alerts.length && <span className="badge">{alerts.length}</span>}
        </a>
        {can('sites.manage') && <Link to="/sites/new" className="btn gold">New project</Link>}
      </PageHead>

      <div className="dpage">
        <OwnSpaceCard />
        {active.some((s) => s.sample) && <SampleBanner />}
        <GettingStarted company={company} sites={active} budgetSet={money ? active.some((s) => !s.sample && finance[s.id]?.budget > 0) : null} />
        <dl className="tiles">
          {money && (
            <>
              <div className="tile"><TileLink to={can('finance.view') ? '/finance' : '/sites'} label="Open finance" /><dt>Portfolio value</dt><dd>{big(budgetAll)}</dd>
                <div className="foot"><span className="delta nt">{active.length} active project{active.length === 1 ? '' : 's'}</span></div></div>
              <div className="tile"><TileLink to="/finance" label="Open finance" /><dt>Spent to date</dt><dd>{big(spentAll)}</dd>
                <div className="foot"><span className={`delta ${usedPct >= 90 ? 'dn' : usedPct > 70 ? 'nt' : 'up'}`}>{budgetAll ? `${usedPct}% of budget` : 'No budget'}</span><Spark data={weeks.map((w) => w.total)} /></div></div>
            </>
          )}
          <div className="tile"><TileLink to="/reports" label="Open daily reports" /><dt>Daily reports</dt>
            <dd>{period === 'today' ? reportsIn : sentInPeriod}<small> of {period === 'today' ? dueToday.length : expected}</small></dd>
            <div className="foot">
              {period === 'today'
                ? <span className={`delta ${reportsIn < dueToday.length ? 'dn' : 'up'}`}>{reportsIn < dueToday.length ? `${dueToday.length - reportsIn} outstanding` : dueToday.length ? 'All in' : 'None needed today'}</span>
                : <span className={`delta ${expected && sentInPeriod / expected < 0.7 ? 'dn' : 'up'}`}>{expected ? `${Math.round((sentInPeriod / expected) * 100)}% sent` : 'None expected'}</span>}
              <Spark data={perDay.map((d) => d.reports)} color="var(--ok)" />
            </div></div>
          <div className="tile"><TileLink to="/issues" label="Open issues" /><dt>Open issues</dt><dd>{openIssues.length}</dd>
            <div className="foot"><span className={`delta ${critical ? 'dn' : 'up'}`}>{critical ? `${critical} critical` : 'None critical'}</span></div></div>
          <div className="tile"><TileLink to="/sites?status=on_hold" label="Open projects on hold" /><dt>On hold</dt><dd>{active.length - reporting.length}</dd>
            <div className="foot"><span className="delta nt">Not chased for reports</span></div></div>
        </dl>

        <ProjectStrip sites={active} states={states} today={today} risk={(s) => money && siteFinanceSummary(finance[s.id], s.progress || 0).overspendRisk} />

        <div className="dgrid">
          <AlertsPanel alerts={alerts} className="c12" />
        </div>
        {money && spentAll > 0 && <p className="hint mt">Figures in {getLocale().currency}. Spending comes from recorded expenses ({cedi(spentAll)} in total across active projects).</p>}
      </div>
    </>
  );
}

// Your projects at a glance (the reference's loading bays): one card each with its image, progress and stage.
// A card is washed with the accent when the project needs you: behind plan, today's report missing, or spending ahead of the work.
const code = (name = '') => name.split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w)).slice(0, 3).map((w) => w[0].toUpperCase()).join('') || 'P';
function ProjectStrip({ sites, states, today, risk }) {
  if (sites.length < 2) return null;
  const why = (s) => {
    if (states[s.id].state === 'behind') return states[s.id].weeksBehind ? `${states[s.id].weeksBehind} week${states[s.id].weeksBehind === 1 ? '' : 's'} behind` : 'Behind plan';
    if (reportDay(s, today) === 'due' && s.status === 'active') return "Today's report missing";
    if (risk(s)) return 'Spending ahead of work';
    return '';
  };
  const hot = sites.filter((s) => why(s)).length;
  return (
    <section className="pstrip" aria-labelledby="pstrip-h">
      <div className="pstrip-h"><h2 id="pstrip-h">Your projects</h2><p>{hot ? `${hot} need${hot === 1 ? 's' : ''} you, shown in colour` : 'All on track'}</p></div>
      <ul className="bays">
        {sites.map((s) => {
          const w = why(s);
          const pct = states[s.id].actual;
          return (
            <li key={s.id}>
              <Link to={`/sites/${s.id}`} className={`bay${w ? ' hot' : ''}`}>
                <ProjectCover site={s} className="bay-img" label={false} />
                <span className="bay-t"><span className="bay-code">{code(s.name)}</span><span className="bay-pct">{pct}%</span></span>
                <b>{s.name}</b>
                <small>{s.stage || 'No stage set'}{w ? <> · <span className="late">{w}</span></> : s.status !== 'active' ? ' · On hold' : ''}</small>
                <span className="bay-bar"><span style={{ width: `${Math.min(100, pct)}%` }} /></span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
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
            <span>Four sample projects (a house, an office block, a road job and a school) with six weeks of reports, photos, workers, materials and spending. Labelled Sample, never send messages, removed in one click.</span>
          </button>
        )}
        {can('company.settings') && <Link to="/welcome" className="choice"><b>Set up step by step</b><span>Company details, features and your team, then your first project.</span></Link>}
      </div>
    </div>
  );
}

// Makes a whole headline box a link (the box stays a description list for screen readers)
function TileLink({ to, label }) {
  return <Link to={to} className="tile-link" aria-label={label} />;
}
