import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ReportButton from '../components/ReportButton';
import ProjectCover from '../components/ProjectCover';
import { prettyDate, todayKey } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useDocsByIds, useQuery, useTitle } from '../lib/hooks';
import { siteDoc, sitesCol } from '../lib/db';
import { Empty, ErrorState, Loading } from '../components/States';
import StatusPill from '../components/StatusPill';
import PageHead from '../components/PageHead';

// Grid (cards with the project image) or list (table). Remembered on this browser.
const VIEW_KEY = 'sf.projectsView';
const savedView = () => { try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; } };

const FILTERS = [['open', 'Active and on hold'], ['active', 'Active'], ['on_hold', 'On hold'], ['closed', 'Closed'], ['all', 'All']];

// All sites in the company, for roles that see every site
export default function Sites() {
  useTitle('Projects');
  const { cid, can, profile } = useAuth();
  const nav = useNavigate();
  // Roles that see every project list them all; site teams load the projects they are on
  const all = can('sites.all');
  const everyone = useQuery(() => all && cid && sitesCol(cid), [cid, all]);
  const mine = useDocsByIds((id) => siteDoc(cid, id), all ? [] : profile?.siteIds || [], [cid]);
  const { data: sites, loading } = all ? everyone : mine;
  const error = all ? everyone.error : null;
  const [filter, setFilter] = useState('open');
  const [q, setQ] = useState('');
  const [view, setViewState] = useState(savedView);
  const setView = (v) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private window: not remembered */ } };
  const today = todayKey();

  if (loading) return <Loading what="sites" />;
  if (error) return <section className="wrap"><ErrorState error={error} what="your sites" /></section>;

  const term = q.trim().toLowerCase();
  const shown = sites
    .filter((s) => filter === 'all' || (filter === 'open' ? s.status !== 'closed' : s.status === filter))
    .filter((s) => !term || `${s.name} ${s.location} ${s.foremanName || ''} ${s.client?.name || ''}`.toLowerCase().includes(term))
    .sort((a, b) => a.name.localeCompare(b.name));
  const count = (f) => sites.filter((s) => (f === 'open' ? s.status !== 'closed' : f === 'all' || s.status === f)).length;

  return (
    <>
    <PageHead title={all ? 'Projects' : 'My projects'} sub={all ? `${sites.length} project${sites.length === 1 ? '' : 's'} in total` : 'The projects you work on. Open one to send today’s report, mark attendance or log materials.'}>
      {can('sites.manage') && <Link to="/sites/new" className="btn gold">New project</Link>}
    </PageHead>
    <section className="wrap">
      <div>
      </div>
      {!sites.length ? (
        <div className="mt">
          <Empty title="No sites yet." action={can('sites.manage') && <Link to="/sites/new" className="btn">Add a site</Link>}>{can('sites.manage') ? 'Add your first site to start tracking reports, materials and workers.' : all ? 'A manager adds projects. They will appear here.' : 'You have not been added to a project yet. Ask your manager to add you.'}</Empty>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <div className="seg" role="group" aria-label="Filter by status">
              {FILTERS.map(([k, label]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label} ({count(k)})</button>)}
            </div>
            <div className="seg view-toggle" role="group" aria-label="View">
              <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M1 1h6v6H1zM9 1h6v6H9zM1 9h6v6H1zM9 9h6v6H9z" /></svg> Grid</button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M1 2h14v2.5H1zM1 6.75h14v2.5H1zM1 11.5h14V14H1z" /></svg> List</button>
            </div>
            <input type="search" aria-label="Search sites" placeholder="Search name, location, foreman or client" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!shown.length ? <Empty title="No sites match." action={<button type="button" className="btn sm ghost" onClick={() => { setQ(''); setFilter('all'); }}>Clear search and filter</button>}>Try another filter or search.</Empty> : view === 'grid' ? (
            <ul className="pgrid">{shown.map((s) => <ProjectCard key={s.id} cid={cid} site={s} today={today} />)}</ul>
          ) : (
            <div className="scroll"><table>
              <thead><tr><th>Site</th><th>Status</th><th>Stage</th><th>Progress</th><th>Planned finish</th><th>Last report</th>{can('site.work') && <th><span className="visually-hidden">Report</span></th>}</tr></thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id} className="row" onClick={() => nav(`/sites/${s.id}`)}>
                    <td><div className="pname"><ProjectCover site={s} className="thumb" label={false} /><div><Link className="sname" to={`/sites/${s.id}`}>{s.name}</Link>{s.sample && <> <span className="pill sample">Sample</span></>}<div className="muted small">{s.location}{s.client?.name ? `, for ${s.client.name}` : ''}</div></div></div></td>
                    <td><StatusPill status={s.status} /></td>
                    <td>{s.stage || '–'}</td>
                    <td><div className="meter"><span style={{ width: `${s.progress || 0}%` }} /></div><small className="muted">{s.progress || 0}%</small></td>
                    <td>{s.planEnd ? prettyDate(s.planEnd) : '–'}</td>
                    <td>{s.lastReportDate === today ? <span className="pill ok">Today {s.lastReportTime}</span> : s.lastReportDate ? prettyDate(s.lastReportDate) : <span className="muted">None yet</span>}</td>
                    {can('site.work') && <td className="nowrap"><ReportButton cid={cid} site={s} size="sm" /></td>}
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </>
      )}
    </section>
    </>
  );
}

// One project in the grid: its image, name, place, progress, finish date and today's report
function ProjectCard({ cid, site: s, today }) {
  const sent = s.lastReportDate === today;
  const pct = Math.round(s.progress || 0);
  return (
    <li className="pcard">
      <Link to={`/sites/${s.id}`} className="pcard-link">
        <div className="pcard-media">
          <ProjectCover site={s} label={false} />
          <span className="pcard-tags"><StatusPill status={s.status} />{s.sample && <span className="pill sample">Sample</span>}</span>
        </div>
        <div className="pcard-body">
          <h3>{s.name}</h3>
          <p className="muted small">{s.location}{s.client?.name ? `, for ${s.client.name}` : ''}</p>
          <div className="pcard-progress">
            <div className="meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress"><span style={{ width: `${pct}%` }} /></div>
            <span className="small"><b>{pct}%</b> · {s.stage || 'No stage'}</span>
          </div>
          <dl className="pcard-facts">
            <div><dt>Planned finish</dt><dd>{s.planEnd ? prettyDate(s.planEnd) : '–'}</dd></div>
            <div><dt>Last report</dt><dd>{sent ? <span className="pill ok">Today {s.lastReportTime}</span> : s.lastReportDate ? prettyDate(s.lastReportDate) : <span className="muted">None yet</span>}</dd></div>
          </dl>
        </div>
      </Link>
      <div className="pcard-foot"><ReportButton cid={cid} site={s} size="sm" /></div>
    </li>
  );
}
