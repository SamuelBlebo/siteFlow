import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { prettyDate, todayKey } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useQuery } from '../lib/hooks';
import { sitesCol } from '../lib/db';
import { Empty, ErrorState, Loading } from '../components/States';
import StatusPill from '../components/StatusPill';

const FILTERS = [['open', 'Active and on hold'], ['active', 'Active'], ['on_hold', 'On hold'], ['closed', 'Closed'], ['all', 'All']];

// All sites in the company, for roles that see every site
export default function Sites() {
  const { cid, can } = useAuth();
  const nav = useNavigate();
  const { data: sites, loading, error } = useQuery(() => cid && sitesCol(cid), [cid]);
  const [filter, setFilter] = useState('open');
  const [q, setQ] = useState('');
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
    <section className="wrap">
      <div className="head row-between">
        <div><h1>Sites</h1><p className="muted">{sites.length} site{sites.length === 1 ? '' : 's'} in total</p></div>
        {can('sites.manage') && <Link to="/sites/new" className="btn">Add a site</Link>}
      </div>
      {!sites.length ? (
        <div style={{ marginTop: 16 }}>
          <Empty title="No sites yet.">{can('sites.manage') ? 'Add your first site to start tracking reports, materials and workers.' : 'A manager adds sites. They will appear here.'}</Empty>
        </div>
      ) : (
        <>
          <div className="row-between" style={{ margin: '16px 0' }}>
            <div className="seg" role="group" aria-label="Filter by status">
              {FILTERS.map(([k, label]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label} ({count(k)})</button>)}
            </div>
            <input type="search" aria-label="Search sites" placeholder="Search name, location, foreman or client" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
          </div>
          {!shown.length ? <Empty title="No sites match." >Try another filter or search.</Empty> : (
            <div className="scroll"><table>
              <thead><tr><th>Site</th><th>Status</th><th>Stage</th><th>Progress</th><th>Planned finish</th><th>Last report</th></tr></thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id} className="row" onClick={() => nav(`/sites/${s.id}`)}>
                    <td><Link className="sname" to={`/sites/${s.id}`}>{s.name}</Link><div className="muted small">{s.location}{s.client?.name ? `, for ${s.client.name}` : ''}</div></td>
                    <td><StatusPill status={s.status} /></td>
                    <td>{s.stage || '–'}</td>
                    <td><div className="meter"><span style={{ width: `${s.progress || 0}%` }} /></div><small className="muted">{s.progress || 0}%</small></td>
                    <td>{s.planEnd ? prettyDate(s.planEnd) : '–'}</td>
                    <td>{s.lastReportDate === today ? <span className="pill ok">Today {s.lastReportTime}</span> : s.lastReportDate ? prettyDate(s.lastReportDate) : <span className="muted">None yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </>
      )}
    </section>
  );
}
