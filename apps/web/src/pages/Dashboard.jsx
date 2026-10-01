import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useQuery, useSiteSignals } from '../lib/hooks';
import { companyDoc, companyIssuesQuery, companyReportsQuery, openIssuesQuery, sitesCol } from '../lib/db';
import {
  activityFeed, budgetUsedPct, cedi, dailyTotals, daysBetweenKeys, issueFlow, longToday, materialStatus, prettyDate, recentWorkDays,
  reportCompliance, scheduleStatus, siteAlerts, siteFinanceSummary, todayKey,
} from '@siteflow/shared';
import AlertsPanel from '../components/AlertsPanel';
import StatusPill from '../components/StatusPill';
import { ScheduleBadge } from '../components/ProgressPanel';
import { Empty, ErrorState, Loading } from '../components/States';

const DAYS = 14;
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return todayKey(d); };
const when = (ms) => {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

// The owner's and manager's view: what needs attention, what is happening, how each site is doing
export default function Dashboard() {
  const { cid, can } = useAuth();
  const nav = useNavigate();
  const money = can('finance.view');
  const today = todayKey();
  const days = recentWorkDays(DAYS);
  const from = days[days.length - 1];
  const { data: company } = useDoc(() => cid && companyDoc(cid), [cid]);
  const { data: sites, loading, error } = useQuery(() => cid && sitesCol(cid), [cid]);
  const { data: openIssues } = useQuery(() => cid && openIssuesQuery(cid), [cid]);
  const { data: recentReports } = useQuery(() => cid && companyReportsQuery(cid, { from }, 500), [cid, from]);
  const { data: recentIssues } = useQuery(() => cid && companyIssuesQuery(cid, 100), [cid]);
  const active = sites.filter((s) => s.status !== 'closed');
  const { materials, usage, present, finance, milestones } = useSiteSignals(cid, active.map((s) => s.id), { withFinance: money });

  if (loading) return <Loading what="sites" />;
  if (error) return <section className="wrap"><ErrorState error={error} what="your sites" onRetry={() => window.location.reload()} /></section>;
  if (!active.length) {
    return (
      <section className="wrap">
        <h1>Welcome to SiteFlow</h1>
        <div style={{ marginTop: 16 }}>
          <Empty title="No sites yet.">{can('sites.manage') ? 'Add your first site to start tracking reports, materials and workers.' : 'A manager adds sites. They will appear here.'}</Empty>
          {can('sites.manage') && <Link to="/sites/new" className="btn" style={{ marginTop: 12, display: 'inline-block' }}>Add a site</Link>}
        </div>
      </section>
    );
  }

  const reporting = active.filter((s) => s.status === 'active');
  const issuesBySite = (sid) => openIssues.filter((i) => i.siteId === sid);
  const alerts = active.flatMap((s) => siteAlerts(s, materials[s.id], usage[s.id], {
    company, finance: money ? finance[s.id] : null, openIssues: issuesBySite(s.id), milestones: milestones[s.id] || [],
  }).map((a) => ({ ...a, site: s })));
  const reportsIn = reporting.filter((s) => s.lastReportDate === today).length;
  const workers = active.reduce((n, s) => n + (present[s.id] || 0), 0);
  const criticalOpen = openIssues.filter((i) => i.priority === 'critical').length;
  const behind = active.filter((s) => scheduleStatus(s, milestones[s.id] || []).state === 'behind').length;
  const compliance = reportCompliance(recentReports, reporting.map((s) => s.id), days);
  const perDay = dailyTotals(recentReports, [...days].reverse());
  const flow = issueFlow(recentIssues, ago(29));
  const feed = activityFeed(recentReports.slice(0, 30), recentIssues.slice(0, 30), 10);
  const maxWorkers = Math.max(0, ...perDay.map((d) => d.workers));
  const spentAll = active.reduce((n, s) => n + (finance[s.id]?.spent || 0), 0);
  const budgetAll = active.reduce((n, s) => n + (finance[s.id]?.budget || 0), 0);
  const sentPct = Math.round((Object.values(compliance).reduce((n, c) => n + c.sent, 0) / Math.max(1, DAYS * reporting.length)) * 100);

  return (
    <section className="wrap">
      <div className="head row-between">
        <div><h1>Today across your sites</h1><p className="muted">{longToday()}, {reporting.length} active{active.length > reporting.length ? `, ${active.length - reporting.length} on hold` : ''}</p></div>
        {can('sites.manage') && <Link to="/sites/new" className="btn ghost">Add a site</Link>}
      </div>

      <dl className="strip">
        <div><dt>Daily reports in</dt><dd>{reportsIn} of {reporting.length}</dd></div>
        <div><dt>Workers on site today</dt><dd>{workers}</dd></div>
        <div><dt>Open issues</dt><dd><Link to="/issues">{openIssues.length}</Link>{criticalOpen ? <small className="neg"> {criticalOpen} critical</small> : null}</dd></div>
        <div><dt>Sites behind programme</dt><dd>{behind}</dd></div>
        {money && <div><dt>Spent of budget</dt><dd>{budgetAll ? `${Math.round((spentAll / budgetAll) * 100)}%` : cedi(spentAll)}</dd></div>}
      </dl>

      <div className="dash-grid">
        <AlertsPanel alerts={alerts} />
        <section className="card feed" aria-labelledby="feed-h">
          <h2 id="feed-h" className="sub" style={{ marginTop: 0 }}>Latest from site</h2>
          {!feed.length ? <p className="muted">Reports and issues appear here as they come in.</p> : (
            <ul>
              {feed.map((f) => (
                <li key={`${f.kind}-${f.siteId}-${f.id}`}>
                  <Link to={f.kind === 'report' ? `/reports/${f.siteId}/${f.id}` : `/issues/${f.siteId}/${f.id}`}>
                    <span className={`pill ${f.kind === 'issue' ? 'bad' : ''}`}>{f.kind === 'issue' ? 'Issue' : 'Report'}</span>{' '}
                    <b>{f.siteName}</b>: {f.title}
                  </Link>
                  <small className="muted">{f.who}, {when(f.at)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <h2 className="sec">How each site is doing</h2>
      <div className="scroll"><table>
        <thead><tr>
          <th>Site</th><th>Progress</th><th>Today's report</th><th>Reports, last 2 weeks</th><th>Workers</th><th>Open issues</th><th>Stock</th>
          {money && <th>Budget used</th>}
        </tr></thead>
        <tbody>
          {active.map((s) => {
            const st = scheduleStatus(s, milestones[s.id] || []);
            const iss = issuesBySite(s.id);
            const crit = iss.filter((i) => i.priority === 'critical').length;
            const lowStock = (materials[s.id] || []).filter((m) => m.active !== false && (materialStatus(m, usage[s.id]?.[m.id]).low || m.stock < 0)).length;
            const c = compliance[s.id];
            const f = finance[s.id];
            const fs = siteFinanceSummary(f, s.progress || 0);
            const since = s.lastReportDate ? daysBetweenKeys(s.lastReportDate, today) : null;
            return (
              <tr key={s.id} className="row" onClick={() => nav(`/sites/${s.id}`)}>
                <td><Link className="sname" to={`/sites/${s.id}`}>{s.name}</Link> {s.status !== 'active' && <StatusPill status={s.status} />}<div className="muted small">{s.location} · {s.stage}</div></td>
                <td>
                  <div className="meter"><span style={{ width: `${st.actual}%` }} />{st.planned != null && <i className="plan-mark" style={{ left: `${st.planned}%` }} title={`${st.planned}% planned`} />}</div>
                  <small className="muted">{st.actual}%</small> <ScheduleBadge st={st} />
                </td>
                <td>{s.lastReportDate === today ? <span className="pill ok">Sent {s.lastReportTime}</span>
                  : s.status !== 'active' ? <span className="muted">–</span>
                  : <><span className="pill bad">Missing</span>{since != null && <div className="muted small">Last {since === 1 ? 'yesterday' : `${since} days ago`}</div>}</>}</td>
                <td>{c ? <><b className={c.pct < 70 ? 'neg' : ''}>{c.pct}%</b> <small className="muted">{c.sent}/{c.expected} days</small></> : '–'}</td>
                <td>{present[s.id] || 0}</td>
                <td>{iss.length
                  ? <Link to={`/sites/${s.id}?tab=issues`} onClick={(e) => e.stopPropagation()}>{iss.length}{crit ? <span className="pill bad" style={{ marginLeft: 4 }}>{crit} critical</span> : null}</Link>
                  : <span className="muted">0</span>}</td>
                <td>{lowStock ? <span className="pill warn">{lowStock} low</span> : <span className="pill ok">OK</span>}</td>
                {money && <td>{f ? <><div className={`meter ${fs.overspendRisk ? 'hot' : ''}`}><span style={{ width: `${Math.min(budgetUsedPct(f), 100)}%` }} /></div><small className="muted">{fs.usedPct}% of {cedi(fs.budget)}</small></> : '–'}</td>}
              </tr>
            );
          })}
        </tbody>
      </table></div>
      <p className="hint">The black mark on a progress bar is where the work should be by today.</p>

      <h2 className="sec">Last two weeks</h2>
      <div className="dash-grid three">
        <section className="card">
          <h3>Workers reported on site</h3>
          <ul className="spark" aria-label="Workers reported on site per working day">
            {perDay.map((d) => (
              <li key={d.date} title={`${prettyDate(d.date)}: ${d.workers} workers in ${d.reports} report${d.reports === 1 ? '' : 's'}`}>
                <span style={{ height: `${maxWorkers ? (d.workers / maxWorkers) * 100 : 0}%` }} />
              </li>
            ))}
          </ul>
          <p className="hint">{prettyDate(perDay[0].date)} to today. Busiest day: {maxWorkers} workers.</p>
        </section>
        <section className="card">
          <h3>Daily reports sent</h3>
          <p className="big">{sentPct}%</p>
          <p className="hint">of expected reports on working days (Sundays not counted). Sites below 70% are marked in the table.</p>
        </section>
        <section className="card">
          <h3>Issues, last 30 days</h3>
          <dl className="facts">
            <dt>Reported</dt><dd>{flow.opened}</dd><dt>Resolved</dt><dd>{flow.resolved}</dd>
            <dt>Open now</dt><dd>{flow.open}{flow.critical ? <span className="neg"> ({flow.critical} critical)</span> : ''}</dd>
          </dl>
        </section>
      </div>
    </section>
  );
}
