import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useQuery } from '../lib/hooks';
import { siteDoc, sitesCol } from '../lib/db';
import { todayKey } from '@siteflow/shared';

export default function MySites() {
  const { cid, profile, isAdmin } = useAuth();
  // Admins list every site. Site team members read each assigned site directly (keeps security rules simple).
  const { data: all } = useQuery(() => isAdmin && cid && sitesCol(cid), [cid, isAdmin]);
  const ids = isAdmin ? all.map((s) => s.id) : profile?.siteIds || [];

  return (
    <section className="wrap narrow">
      <h1>Site work</h1>
      <p className="muted">Pick a site to mark attendance, log materials or send today's report.</p>
      {!ids.length ? <p className="empty" style={{ marginTop: 16 }}>You haven't been added to a site yet. Ask your manager to add you.</p> : (
        <ul className="list" style={{ marginTop: 16 }}>{ids.map((id) => <SiteLink key={id} cid={cid} sid={id} />)}</ul>
      )}
    </section>
  );
}

function SiteLink({ cid, sid }) {
  const { data: s } = useDoc(() => siteDoc(cid, sid), [cid, sid]);
  if (!s) return null;
  const sent = s.lastReportDate === todayKey();
  return (
    <li><Link className="it" to={`/work/${sid}`}>
      <span className="grow"><b>{s.name}</b><small>{s.location}</small></span>
      <span className={`pill ${sent ? 'ok' : 'bad'}`}>{sent ? 'Report sent' : 'Report due'}</span>
    </Link></li>
  );
}
