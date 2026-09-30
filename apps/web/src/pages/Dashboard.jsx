import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useQuery, useSiteSignals } from '../lib/hooks';
import { sitesCol } from '../lib/db';
import { siteAlerts } from '@siteflow/shared';
import { longToday, todayKey } from '@siteflow/shared';
import { cedi, pct } from '@siteflow/shared';
import AlertsPanel from '../components/AlertsPanel';

export default function Dashboard() {
  const { cid } = useAuth();
  const nav = useNavigate();
  const { data: sites, loading } = useQuery(() => cid && sitesCol(cid), [cid]);
  const active = sites.filter((s) => s.status !== 'closed');
  const { materials, usage, present } = useSiteSignals(cid, active.map((s) => s.id));
  const today = todayKey();

  if (loading) return <p className="pad">Loading sites…</p>;
  if (!active.length) {
    return (
      <section className="wrap">
        <h1>Welcome to SiteFlow</h1>
        <div className="empty" style={{ marginTop: 16 }}>
          <p>Add your first site to start tracking reports, materials and workers.</p>
          <Link to="/sites/new" className="btn" style={{ marginTop: 12, display: 'inline-block' }}>Add a site</Link>
        </div>
      </section>
    );
  }

  const alerts = active.flatMap((s) => siteAlerts(s, materials[s.id], usage[s.id]).map((a) => ({ ...a, site: s })));
  const reportsIn = active.filter((s) => s.lastReportDate === today).length;
  const workers = active.reduce((n, s) => n + (present[s.id] || 0), 0);
  const spent = active.reduce((n, s) => n + (s.spent || 0), 0);

  return (
    <section className="wrap">
      <div className="head row-between">
        <div><h1>Today across your sites</h1><p className="muted">{longToday()}, {active.length} active sites</p></div>
        <Link to="/sites/new" className="btn ghost">Add a site</Link>
      </div>
      <dl className="strip">
        <div><dt>Daily reports in</dt><dd>{reportsIn} of {active.length}</dd></div>
        <div><dt>Workers on site today</dt><dd>{workers}</dd></div>
        <div><dt>Total spent</dt><dd>{cedi(spent)}</dd></div>
      </dl>
      <AlertsPanel alerts={alerts} />
      <h2 className="sec">Sites</h2>
      <div className="scroll"><table>
        <thead><tr><th>Site</th><th>Stage</th><th>Progress</th><th>Budget used</th><th>Today's report</th><th>Workers</th></tr></thead>
        <tbody>
          {active.map((s) => {
            const p = pct(s.spent, s.budget);
            return (
              <tr key={s.id} className="row" onClick={() => nav(`/sites/${s.id}`)}>
                <td><Link className="sname" to={`/sites/${s.id}`}>{s.name}</Link><div className="muted small">{s.location}</div></td>
                <td>{s.stage || '–'}</td>
                <td><div className="meter"><span style={{ width: `${s.progress || 0}%` }} /></div><small className="muted">{s.progress || 0}%</small></td>
                <td><div className={`meter ${p >= 90 ? 'hot' : ''}`}><span style={{ width: `${Math.min(p, 100)}%` }} /></div><small className="muted">{p}% of {cedi(s.budget)}</small></td>
                <td>{s.lastReportDate === today ? <span className="pill ok">Sent {s.lastReportTime}</span> : <span className="pill bad">Missing</span>}</td>
                <td>{present[s.id] || 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </section>
  );
}
