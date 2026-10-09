import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useSiteData, useTitle } from '../lib/hooks';
import { companyDoc, siteDoc } from '../lib/db';
import { isOn, isSiteOpen, longToday, todayKey } from '@siteflow/shared';
import PageHead from '../components/PageHead';
import Tabs from '../components/Tabs';
import ReportForm from '../components/ReportForm';
import ReportHistory from '../components/ReportHistory';
import SiteIssues from '../components/SiteIssues';
import ProgressPanel from '../components/ProgressPanel';
import LabourPanel from '../components/LabourPanel';
import MaterialsPanel from '../components/MaterialsPanel';
import MaterialsTable from '../components/MaterialsTable';
import { ErrorState, Loading } from '../components/States';

export default function SiteWorkspace() {
  const { sid } = useParams();
  const { cid, profile, can } = useAuth();
  // The tab lives in the address, so Back, refresh and shared links keep it
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'today';
  const setTab = (t) => setParams(t === 'today' ? {} : { tab: t }, { replace: true });
  const { data: site, loading, error } = useDoc(() => cid && siteDoc(cid, sid), [cid, sid]);
  const d = useSiteData(cid, sid, { withPay: can('finance.view') });
  const { data: company } = useDoc(() => cid && companyDoc(cid), [cid]);
  // Materials and labour follow the company's modules (switching one off hides it, the data is kept)
  const mod = (k) => isOn(company, k);
  useTitle(site ? `${site.name}: site work` : 'Site work');

  if (loading) return <Loading />;
  if (error) return <section className="wrap narrow"><ErrorState error={error} what="this site" /><Link to="/work">Back to your sites</Link></section>;
  if (!site) return <p className="pad">You don't have access to this site. <Link to="/work">Back to your sites</Link></p>;

  // Closed sites are read-only (the rules block writes too)
  const work = can('site.work') && isSiteOpen(site);
  const usedToday = Object.keys(d.usage).length > 0;
  const sent = site.lastReportDate === todayKey();
  const steps = [
    mod('labour') && { key: 'workers', done: d.presentCount > 0, title: 'Mark attendance', note: d.presentCount ? `${d.presentCount} workers present` : 'Tick who came to site today' },
    mod('materials') && { key: 'materials', done: usedToday, title: 'Log materials used', note: usedToday ? 'Usage logged today' : 'Record what was used today' },
    { key: 'report', done: sent, title: 'Send daily report', note: sent ? `Sent at ${site.lastReportTime}` : 'Progress, photos and issues' },
  ].filter(Boolean);
  const tabs = [['today', 'Today'], work && ['report', 'Report'], ['progress', 'Progress'], ['issues', 'Issues'],
    mod('materials') && ['materials', 'Materials'], mod('labour') && ['workers', 'Workers'], ['history', 'History']].filter(Boolean);

  return (
    <>
    <PageHead title={site.name} sub={`${site.location}, stage: ${site.stage}. ${longToday()}, signed in as ${profile.name}.`}>
      <Link to="/work" className="btn ghost sm">All my sites</Link>
    </PageHead>
    <section className="wrap narrow">
      {!work && <p className="notice warn">{isSiteOpen(site) ? 'You can view this site but not change it.' : 'This site is closed. You can view its records but not add new ones.'}</p>}
      <Tabs value={tab} onChange={setTab} tabs={tabs} label="Site work">
      {d.error && <ErrorState error={d.error} what="some site data" />}

      {tab === 'today' && (
        <>
          <ol className="steps">
            {steps.map((s) => (
              <li key={s.key} className={s.done ? 'done' : ''}>
                <button type="button" onClick={() => setTab(work || s.key !== 'report' ? s.key : 'today')}><span><b>{s.title}</b><small>{s.note}</small></span></button>
              </li>
            ))}
          </ol>
          {mod('materials') && <><h3 className="sub">Stock on site</h3><MaterialsTable materials={d.materials} usage={d.usage} /></>}
        </>
      )}
      {tab === 'report' && work && <ReportForm cid={cid} site={site} presentCount={d.presentCount} logs={d.logs} />}
      {tab === 'history' && <ReportHistory cid={cid} site={site} />}
      {tab === 'issues' && <SiteIssues cid={cid} site={site} />}
      {tab === 'progress' && <ProgressPanel cid={cid} site={site} canWork={work} />}
      {tab === 'materials' && mod('materials') && <MaterialsPanel cid={cid} site={site} data={d} canWork={work} />}
      {tab === 'workers' && mod('labour') && <LabourPanel cid={cid} site={site} data={d} canWork={work} />}
      </Tabs>
    </section>
    </>
  );
}
