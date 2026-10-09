import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useQuery, useTitle } from '../lib/hooks';
import { siteDoc, sitesCol } from '../lib/db';
import { todayKey } from '@siteflow/shared';
import { Empty, ErrorState, Loading } from '../components/States';
import StatusPill from '../components/StatusPill';
import PageHead from '../components/PageHead';

export default function MySites() {
  useTitle('Your sites');
  const { cid, profile, can } = useAuth();
  const all = can('sites.all');
  // Roles that see every site list them; site-scoped roles read each assigned site directly
  const { data: sites, loading, error } = useQuery(() => all && cid && sitesCol(cid), [cid, all]);
  const ids = all ? sites.filter((s) => s.status !== 'closed').map((s) => s.id) : profile?.siteIds || [];

  return (
    <>
    <PageHead title="Site work" sub="Pick a project to mark attendance, log materials or send today's report." />
    <section className="wrap narrow">
      <div className="mt">
        {all && loading ? <Loading what="sites" /> : error ? <ErrorState error={error} what="your sites" /> : !ids.length ? (
          <Empty title="No sites yet.">{all ? 'Sites appear here once a manager adds them.' : "You haven't been added to a site yet. Ask your manager to add you."}</Empty>
        ) : (
          <ul className="list">{ids.map((id) => <SiteLink key={id} cid={cid} sid={id} />)}</ul>
        )}
      </div>
    </section>
    </>
  );
}

function SiteLink({ cid, sid }) {
  const { data: s, error } = useDoc(() => siteDoc(cid, sid), [cid, sid]);
  if (error) return <li><span className="it muted">A site could not be loaded. You may no longer have access.</span></li>;
  if (!s || s.status === 'closed') return null;
  const sent = s.lastReportDate === todayKey();
  return (
    <li><Link className="it" to={`/work/${sid}`}>
      <span className="grow"><b>{s.name}{s.sample && <> <span className="pill sample">Sample</span></>}</b><small>{s.location}</small></span>
      {s.status === 'on_hold' ? <StatusPill status="on_hold" /> : <span className={`pill ${sent ? 'ok' : 'bad'}`}>{sent ? 'Report sent' : 'Report due'}</span>}
    </Link></li>
  );
}
