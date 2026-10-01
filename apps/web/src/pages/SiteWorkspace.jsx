import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useSiteData } from '../lib/hooks';
import { siteDoc } from '../lib/db';
import { isSiteOpen, longToday, todayKey } from '@siteflow/shared';
import Tabs from '../components/Tabs';
import ReportForm from '../components/ReportForm';
import ReportHistory from '../components/ReportHistory';
import LabourPanel from '../components/LabourPanel';
import MaterialsPanel from '../components/MaterialsPanel';
import MaterialsTable from '../components/MaterialsTable';
import { ErrorState, Loading } from '../components/States';

export default function SiteWorkspace() {
  const { sid } = useParams();
  const { cid, profile, can } = useAuth();
  const [tab, setTab] = useState('today');
  const { data: site, loading, error } = useDoc(() => cid && siteDoc(cid, sid), [cid, sid]);
  const d = useSiteData(cid, sid, { withPay: can('finance.view') });

  if (loading) return <Loading />;
  if (error) return <section className="wrap narrow"><ErrorState error={error} what="this site" /><Link to="/work">Back to your sites</Link></section>;
  if (!site) return <p className="pad">You don't have access to this site. <Link to="/work">Back to your sites</Link></p>;

  // Closed sites are read-only (the rules block writes too)
  const work = can('site.work') && isSiteOpen(site);
  const usedToday = Object.keys(d.usage).length > 0;
  const sent = site.lastReportDate === todayKey();
  const steps = [
    { key: 'workers', done: d.presentCount > 0, title: 'Mark attendance', note: d.presentCount ? `${d.presentCount} workers present` : 'Tick who came to site today' },
    { key: 'materials', done: usedToday, title: 'Log materials used', note: usedToday ? 'Usage logged today' : 'Record what was used today' },
    { key: 'report', done: sent, title: 'Send daily report', note: sent ? `Sent at ${site.lastReportTime}` : 'Progress, photos and issues' },
  ];
  const tabs = work
    ? [['today', 'Today'], ['report', 'Report'], ['materials', 'Materials'], ['workers', 'Workers'], ['history', 'History']]
    : [['today', 'Today'], ['materials', 'Materials'], ['workers', 'Workers'], ['history', 'History']];

  return (
    <section className="wrap narrow">
      <Link to="/work" className="btn sm ghost back">Your sites</Link>
      <h1>{site.name}</h1>
      <p className="muted">{longToday()}. Signed in as {profile.name}.</p>
      {!work && <p className="notice warn">{isSiteOpen(site) ? 'You can view this site but not change it.' : 'This site is closed. You can view its records but not add new ones.'}</p>}
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {d.error && <ErrorState error={d.error} what="some site data" />}

      {tab === 'today' && (
        <>
          <ol className="steps">
            {steps.map((s) => (
              <li key={s.key} className={s.done ? 'done' : ''}>
                <button onClick={() => setTab(work || s.key !== 'report' ? s.key : 'today')}><span><b>{s.title}</b><small>{s.note}</small></span></button>
              </li>
            ))}
          </ol>
          <h3 className="sub">Stock on site</h3>
          <MaterialsTable materials={d.materials} usage={d.usage} />
        </>
      )}
      {tab === 'report' && work && <ReportForm cid={cid} site={site} presentCount={d.presentCount} logs={d.logs} />}
      {tab === 'history' && <ReportHistory cid={cid} site={site} />}
      {tab === 'materials' && <MaterialsPanel cid={cid} site={site} data={d} canWork={work} />}
      {tab === 'workers' && <LabourPanel cid={cid} site={site} data={d} canWork={work} />}
    </section>
  );
}
