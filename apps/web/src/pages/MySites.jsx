import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useQuery } from '../lib/hooks';
import { siteDoc, sitesCol } from '../lib/db';
import { todayKey } from '@siteflow/shared';
import { Empty, ErrorState, Loading } from '../components/States';

export default function MySites() {
  const { cid, profile, can } = useAuth();
  const all = can('sites.all');
  // Roles that see every site list them; site-scoped roles read each assigned site directly
  const { data: sites, loading, error } = useQuery(() => all && cid && sitesCol(cid), [cid, all]);
  const ids = all ? sites.filter((s) => s.status !== 'closed').map((s) => s.id) : profile?.siteIds || [];

  return (
    <section className="wrap narrow">
      <h1>Site work</h1>
      <p className="muted">Pick a site to mark attendance, log materials or send today's report.</p>
      <div style={{ marginTop: 16 }}>
        {all && loading ? <Loading what="sites" /> : error ? <ErrorState error={error} what="your sites" /> : !ids.length ? (
          <Empty title="No sites yet.">{all ? 'Sites appear here once a manager adds them.' : "You haven't been added to a site yet. Ask your manager to add you."}</Empty>
        ) : (
          <ul className="list">{ids.map((id) => <SiteLink key={id} cid={cid} sid={id} />)}</ul>
        )}
      </div>
    </section>
  );
}

function SiteLink({ cid, sid }) {
  const { data: s, error } = useDoc(() => siteDoc(cid, sid), [cid, sid]);
  if (error) return <li><span className="it muted">A site could not be loaded. You may no longer have access.</span></li>;
  if (!s || s.status === 'closed') return null;
  const sent = s.lastReportDate === todayKey();
  return (
    <li><Link className="it" to={`/work/${sid}`}>
      <span className="grow"><b>{s.name}</b><small>{s.location}</small></span>
      <span className={`pill ${sent ? 'ok' : 'bad'}`}>{sent ? 'Report sent' : 'Report due'}</span>
    </Link></li>
  );
}
