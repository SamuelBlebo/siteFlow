import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useSiteData } from '../lib/hooks';
import { siteDoc } from '../lib/db';
import { longToday, todayKey } from '@siteflow/shared';
import Tabs from '../components/Tabs';
import ReportForm from '../components/ReportForm';
import AttendanceList from '../components/AttendanceList';
import AddWorkerForm from '../components/AddWorkerForm';
import MaterialLogForm from '../components/MaterialLogForm';
import MaterialsTable from '../components/MaterialsTable';

export default function SiteWorkspace() {
  const { sid } = useParams();
  const { cid, profile } = useAuth();
  const [tab, setTab] = useState('today');
  const { data: site, loading } = useDoc(() => cid && siteDoc(cid, sid), [cid, sid]);
  const d = useSiteData(cid, sid);

  if (loading) return <p className="pad">Loading…</p>;
  if (!site) return <p className="pad">You don't have access to this site. <Link to="/work">Back to your sites</Link></p>;

  const usedToday = Object.keys(d.usage).length > 0;
  const sent = site.lastReportDate === todayKey();
  const steps = [
    { key: 'workers', done: d.presentCount > 0, title: 'Mark attendance', note: d.presentCount ? `${d.presentCount} workers present` : 'Tick who came to site today' },
    { key: 'materials', done: usedToday, title: 'Log materials used', note: usedToday ? 'Usage logged today' : 'Record what was used today' },
    { key: 'report', done: sent, title: 'Send daily report', note: sent ? `Sent at ${site.lastReportTime}` : 'Progress, photos and issues' },
  ];

  return (
    <section className="wrap narrow">
      <Link to="/work" className="btn sm ghost back">Your sites</Link>
      <h1>{site.name}</h1>
      <p className="muted">{longToday()}. Signed in as {profile.name}.</p>
      <Tabs value={tab} onChange={setTab} tabs={[['today', 'Today'], ['report', 'Report'], ['materials', 'Materials'], ['workers', 'Workers']]} />

      {tab === 'today' && (
        <>
          <ol className="steps">
            {steps.map((s) => (
              <li key={s.key} className={s.done ? 'done' : ''}>
                <button onClick={() => setTab(s.key)}><span><b>{s.title}</b><small>{s.note}</small></span></button>
              </li>
            ))}
          </ol>
          <h3 className="sub">Stock on site</h3>
          <MaterialsTable materials={d.materials} usage={d.usage} />
        </>
      )}
      {tab === 'report' && <ReportForm cid={cid} sid={sid} site={site} presentCount={d.presentCount} />}
      {tab === 'materials' && (
        <>
          <MaterialLogForm cid={cid} sid={sid} materials={d.materials} />
          <h3 className="sub">Stock</h3>
          <MaterialsTable materials={d.materials} usage={d.usage} />
        </>
      )}
      {tab === 'workers' && (
        <>
          <AttendanceList cid={cid} sid={sid} workers={d.workers} attendance={d.attendance} />
          <AddWorkerForm cid={cid} sid={sid} />
        </>
      )}
    </section>
  );
}
