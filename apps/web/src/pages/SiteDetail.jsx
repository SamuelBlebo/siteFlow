import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, usePagedQuery, useQuery, useSiteData, useTitle } from '../lib/hooks';
import {
  companyDoc, financeDoc, setBudget, setClientReports, setSiteStatus, siteDoc, siteIssuesQuery, siteReportsQuery, teamQuery, updateSiteDetails,
} from '../lib/db';
import { save, savedText, toast } from '../lib/save';
import { deleteProject, team } from '../lib/account';
import {
  ROLE_LABELS, SITE_STATUSES, SITE_STATUS_LABELS, big, budgetInput, budgetUsedPct, cedi, isOn,
  friendlyError, isSiteOpen, isSiteScoped, materialStatus, reportDay, plannedPct, prettyDate, siteFormValues, siteTeam, todayKey,
  validate, waPhone, currencySymbol } from '@siteflow/shared';
import Tabs from '../components/Tabs';
import TodayPanel from '../components/TodayPanel';
import TodayReport from '../components/TodayReport';
import { MyChangeRequests } from '../components/ReportReview';
import ReportHistory from '../components/ReportHistory';
import ReportRequests from '../components/ReportRequests';
import MaterialsPanel from '../components/MaterialsPanel';
import SiteIssues from '../components/SiteIssues';
import ProgressPanel from '../components/ProgressPanel';
import BudgetPanel from '../components/BudgetPanel';
import LabourPanel from '../components/LabourPanel';
import SiteForm from '../components/SiteForm';
import ProjectDrawing from '../components/ProjectDrawing';
import ModelCard from '../components/ModelCard';
import PhotoGallery from '../components/PhotoGallery';
import ReportButton from '../components/ReportButton';
import ProjectCover from '../components/ProjectCover';
import ContactLinks from '../components/ContactLinks';
import AiOverview from '../components/AiOverview';
import { ReportDayPill, ReportDaysSetting } from '../components/ReportDays';
import { removeCover, uploadCover } from '../lib/cover';
import StatusPill from '../components/StatusPill';
import { Empty, ErrorState, Loading } from '../components/States';
import { Ring } from '../components/Charts';
import Choice from '../components/Choice';

export default function SiteDetail() {
  const { sid } = useParams();
  const { cid, can, role } = useAuth();
  const [params, setParams] = useSearchParams();
  // write: open today's report form straight away (Make a report, the Today checklist)
  const setTab = (t, write = false) => setParams(write ? { tab: t, write: '1' } : { tab: t }, { replace: true });
  const { data: site, loading, error } = useDoc(() => cid && siteDoc(cid, sid), [cid, sid]);
  const data = useSiteData(cid, sid, { withPay: can('finance.view') });
  const { data: company } = useDoc(() => cid && companyDoc(cid), [cid]);
  const mod = (k) => isOn(company, k);
  const money = can('finance.view') && mod('budget');
  const { data: fin } = useDoc(() => money && cid && financeDoc(cid, sid), [cid, sid, money]);
  useTitle(site?.name || 'Project');

  if (loading) return <Loading />;
  if (error) return <section className="wrap"><ErrorState error={error} what="this site" /></section>;
  if (!site) return <p className="pad">This project doesn't exist or you don't have access. <Link to="/sites">Back to projects</Link></p>;

  const open = isSiteOpen(site);
  const work = can('site.work') && open;
  // One page per project for everyone. The site team starts on Today; managers on Overview.
  // Older addresses (the site workspace's tab names) still land on the right tab.
  const OLD_TABS = { report: 'reports', history: 'reports', drawing: 'overview', workers: 'labour' };
  const asked = params.get('tab');
  const tab = OLD_TABS[asked] || asked || (can('site.work') && isSiteScoped(role) ? 'today' : 'overview');
  const tabs = [...(can('site.work') ? [['today', 'Live today']] : []), ['overview', 'Overview'], ['reports', 'Daily reports'], ['photos', 'Photos'], ['progress', 'Progress'], ['issues', 'Issues']];
  if (mod('materials')) tabs.push(['materials', 'Materials']);
  if (mod('labour')) tabs.push(['labour', 'Labour']);
  if (money) tabs.push(['budget', 'Budget']);
  if (can('team.manage') || can('sites.manage')) tabs.push(['team', 'Team']);
  if (can('sites.manage')) tabs.push(['settings', 'Settings']);

  return (
    <>
    <div className="dtop">
      <p className="crumb" style={{ marginRight: 'auto' }}>{can('sites.all') && <><Link to="/">Dashboard</Link> / </>}<Link to="/sites">{can('sites.all') ? 'Projects' : 'My projects'}</Link> / {site.name}</p>
      <ReportButton cid={cid} site={site} />
    </div>
    <section className="wrap">
      <div className="panel">
        <div className={`sitehead ${site.cover ? 'with-cover' : ''}`}>
          {site.cover && <ProjectCover site={site} className="head" />}
          <Ring pct={site.progress || 0} size={84} />
          <div>
            <h1>{site.name} {site.sample && <span className="pill sample">Sample</span>} {site.status !== 'active' && <StatusPill status={site.status} />}</h1>
            <div className="meta"><span>{site.location}</span><span>Foreman: {site.foremanName || '–'}</span><span>Stage: {site.stage}</span></div>
          </div>
          <ReportDayPill cid={cid} site={site} />
        </div>
        <dl className="statrow">
          {money && fin ? (
            <>
              <div><dt>Budget</dt><dd>{fin.budget ? big(fin.budget) : 'Not set'}</dd></div>
              <div><dt>Spent</dt><dd className={budgetUsedPct(fin) >= 90 ? 'badt' : ''}>{big(fin.spent || 0)}</dd></div>
              <div><dt>Remaining</dt><dd>{fin.budget ? big(fin.budget - (fin.spent || 0)) : '–'}</dd></div>
            </>
          ) : (
            <>
              <div><dt>Stage</dt><dd>{site.stage}</dd></div>
              <div><dt>Progress</dt><dd>{site.progress || 0}%</dd></div>
            </>
          )}
          {mod('labour') && <div><dt>On site today</dt><dd>{data.presentCount}</dd></div>}
        </dl>
      </div>
      {!open && (
        <p className="notice warn">
          This site is closed. Its records are kept and can be viewed, but no new reports, attendance or materials can be added.
          {can('sites.manage') ? ' Reopen it from Settings.' : ''}
        </p>
      )}
      <Tabs value={tab} onChange={setTab} tabs={tabs} label="Section">
      {data.error && ['materials', 'labour', 'overview'].includes(tab) && <ErrorState error={data.error} what="site data" />}
      {tab === 'overview' && <><AiOverview site={site} kind="project" stamp={`${site.lastReportDate}|${site.lastReportTime}|${site.progress}|${site.stage}`} /><ProjectDrawing cid={cid} site={site} /><ModelCard cid={cid} site={site} /><OverviewTab site={site} data={data} materialsOn={mod('materials')} /></>}
      {tab === 'today' && <AiOverview site={site} kind="today" stamp={`${site.lastReportDate}|${site.lastReportTime}|${data.presentCount}`} />}
      {tab === 'today' && <TodayPanel cid={cid} site={site} data={data} mod={mod} work={work} onGo={setTab} />}
      {tab === 'reports' && (
        <>
          {work && <MyChangeRequests cid={cid} site={site} />}
          {work && <TodayReport cid={cid} site={site} data={data} startOpen={params.get('write') === '1' || asked === 'report'} />}
          <ReportRequests cid={cid} site={site} startOpen={params.get('request') === '1'} />
          <h3 className="sub">Report history</h3>
          <ReportHistory cid={cid} site={site} />
        </>
      )}
      {tab === 'photos' && <SitePhotos cid={cid} site={site} />}
      {tab === 'issues' && <SiteIssues cid={cid} site={site} />}
      {tab === 'progress' && <ProgressPanel cid={cid} site={site} canWork={work} />}
      {tab === 'materials' && mod('materials') && <MaterialsPanel cid={cid} site={site} data={data} canWork={work} />}
      {tab === 'labour' && mod('labour') && <LabourPanel cid={cid} site={site} data={data} canWork={work} />}
      {tab === 'budget' && money && <BudgetPanel cid={cid} site={site} data={data} />}
      {tab === 'team' && <TeamTab cid={cid} sid={sid} site={site} />}
      {tab === 'settings' && can('sites.manage') && <SettingsTab cid={cid} sid={sid} site={site} />}
      </Tabs>
    </section>
    </>
  );
}

function OverviewTab({ site, data, materialsOn }) {
  const today = todayKey();
  const planned = plannedPct(site);
  const low = materialsOn ? data.materials.filter((m) => materialStatus(m, data.usage[m.id]).low) : [];
  const contact = (name, phone, email) => (
    <>
      <b>{name || '–'}</b>
      {phone && <div className="small"><a href={`tel:${phone}`}>{phone}</a> · <a href={`https://wa.me/${waPhone(phone)}`} target="_blank" rel="noreferrer">WhatsApp</a></div>}
      {email && <div className="small"><a href={`mailto:${email}`}>{email}</a></div>}
    </>
  );
  const dates = site.planStart || site.planEnd
    ? `${site.planStart ? prettyDate(site.planStart) : '?'} to ${site.planEnd ? prettyDate(site.planEnd) : '?'}`
    : 'No dates set';
  return (
    <>
      <dl className="cols">
        <div><dt>Today's report</dt><dd>{{ sent: `Sent ${site.lastReportTime}`, due: 'Not yet', skipped: 'Not needed (skipped)', day_off: 'Day off', not_active: '–' }[reportDay(site, today)]}</dd></div>
        <div><dt>Workers on site today</dt><dd>{data.presentCount}</dd></div>
        {materialsOn && <div><dt>Materials to reorder</dt><dd>{low.length}</dd></div>}
        <div><dt>Progress / planned</dt><dd>{site.progress || 0}%{planned != null ? ` / ${planned}%` : ''}</dd></div>
      </dl>
      <div className="grid2">
        <div className="card">
          <h3>Project</h3>
          <dl className="facts">
            <dt>Status</dt><dd><StatusPill status={site.status} /></dd>
            <dt>Location</dt><dd>{site.location}</dd>
            <dt>Stage</dt><dd>{site.stage}</dd>
            <dt>Planned</dt><dd>{dates}</dd>
            <dt>Last report</dt><dd>{site.lastReportDate ? `${prettyDate(site.lastReportDate)}, ${site.lastReportTime}` : 'None yet'}</dd>
          </dl>
        </div>
        <div className="card">
          <h3>People</h3>
          <dl className="facts">
            <dt>Foreman</dt><dd>{contact(site.foremanName, site.foremanPhone, site.foremanEmail)}</dd>
            <dt>Client</dt><dd>{site.client ? contact(site.client.name, site.client.phone, site.client.email) : '–'}</dd>
          </dl>
        </div>
      </div>
      {!!low.length && <p className="notice warn mt">Reorder soon: {low.map((m) => `${m.name} (${m.stock} ${m.unit} left)`).join(', ')}.</p>}
    </>
  );
}

// Who can see this site. Site managers put supervisors and viewers on or off it.
function TeamTab({ cid, sid, site }) {
  const { can } = useAuth();
  const allowed = can('team.manage') || can('sites.manage');
  const { data: members, loading, error } = useQuery(() => cid && allowed && teamQuery(cid), [cid, allowed]);
  const [busy, setBusy] = useState('');
  if (!allowed) return <Empty title="Site team">Ask a project manager or admin to see or change who works on this site.</Empty>;
  if (loading) return <Loading what="the team" />;
  if (error) return <ErrorState error={error} what="the team" />;
  const t = siteTeam(members, sid);
  const manage = can('sites.manage');

  async function toggle(m, assigned) {
    setBusy(m.id);
    try {
      await team.assignToSite({ sid, uid: m.id, assigned });
      toast(`${m.name} ${assigned ? 'added to' : 'removed from'} ${site.name}.`);
    } catch (e) {
      console.error('assignToSite failed', e);
      toast(friendlyError(e), 'err');
    } finally {
      setBusy('');
    }
  }

  const row = (m, action) => (
    <li key={m.id}><span className="it">
      <span className="grow"><b>{m.name}</b><small>{ROLE_LABELS[m.role]}{m.email ? `, ${m.email}` : ''}</small></span><ContactLinks person={m} compact />{action}
    </span></li>
  );
  const noneToAdd = can('team.manage')
    ? 'Everyone with a site role is already here. Add new people on the Team page.'
    : 'No one else to add. An owner or admin adds new people.';
  return (
    <>
      <h3 className="sub">Working on this site</h3>
      {!t.assigned.length
        ? <Empty title="Nobody is assigned yet.">{manage ? 'Add a site supervisor below so they can send daily reports.' : ''}</Empty>
        : <ul className="list">{t.assigned.map((m) => row(m, manage && <button type="button" className="btn sm ghost" disabled={busy === m.id} onClick={() => toggle(m, false)}>Remove</button>))}</ul>}
      {manage && (
        <>
          <h3 className="sub">Add to this site</h3>
          {!t.available.length
            ? <Empty>{noneToAdd}</Empty>
            : <ul className="list">{t.available.map((m) => row(m, <button type="button" className="btn sm" disabled={busy === m.id} onClick={() => toggle(m, true)}>Add</button>))}</ul>}
        </>
      )}
      <h3 className="sub">Also sees this site</h3>
      <p className="hint">These roles see every site.</p>
      <ul className="list">{t.allSites.map((m) => row(m, null))}</ul>
    </>
  );
}

function SettingsTab({ cid, sid, site }) {
  const { can } = useAuth();
  const { data: finance } = useDoc(() => can('finance.view') && financeDoc(cid, sid), [cid, sid]);
  const [budget, setBudgetValue] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);

  async function saveDetails(details) {
    const res = await save(updateSiteDetails(cid, sid, details), 'Site details'); // throws a friendly message
    toast(savedText(res, 'Site details'));
  }
  async function changeStatus(status) {
    // Ask before every change of status
    const question = {
      on_hold: `Put ${site.name} on hold? Daily reports won't be expected and nobody will be chased for them. The site team can still send reports. You can make it active again at any time.`,
      closed: `Close ${site.name}? The site team will no longer be able to add reports, attendance or materials. Everything recorded stays. You can reopen it later.`,
      active: site.status === 'closed'
        ? `Reopen ${site.name}? The site team will be able to add reports, attendance and materials again, and daily reports will be expected on working days.`
        : `Make ${site.name} active again? Daily reports will be expected on working days, and missing ones chased.`,
    }[status];
    if (question && !window.confirm(question)) return;
    setStatusBusy(true);
    try {
      await save(setSiteStatus(cid, sid, status), 'Site status');
      toast(`${site.name} is now ${SITE_STATUS_LABELS[status].toLowerCase()}.`);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setStatusBusy(false);
    }
  }
  async function saveBudget(e) {
    e.preventDefault();
    const v = validate(budgetInput, { budget });
    if (!v.ok) return toast(v.error, 'err');
    try {
      await save(setBudget(cid, sid, v.data.budget), 'Budget');
      toast('Budget saved.');
      setBudgetValue('');
    } catch (e2) {
      toast(e2.message, 'err');
    }
  }

  return (
    <>
      <h3 className="sub">Status</h3>
      <Choice label="Site status" value={site.status} disabled={statusBusy} onChange={(st) => st !== site.status && changeStatus(st)}
        options={SITE_STATUSES.map((st) => ({ value: st, label: SITE_STATUS_LABELS[st] }))} />
      <p className="hint">Active: daily reports expected. On hold: work paused, no report reminders. Closed: finished, read-only for the site team.</p>

      <h3 className="sub">Report days</h3>
      <ReportDaysSetting cid={cid} site={site} />

      <h3 className="sub">Project image</h3>
      <CoverSetting cid={cid} site={site} />

      <h3 className="sub">Client emails</h3>
      <label className="dwg-check"><input type="checkbox" checked={!!site.clientReports} disabled={!site.client?.email}
        onChange={(e) => save(setClientReports(cid, sid, e.target.checked), 'Client emails').then(() => toast(e.target.checked ? `Each daily report will be emailed to ${site.client.name}.` : 'The client no longer gets daily reports.')).catch((e2) => toast(e2.message, 'err'))} />
        Email each daily report to the client{site.client?.email ? ` (${site.client.email})` : ''}</label>
      <p className="hint">{site.client?.email ? 'Reports carry no money figures. The client can unsubscribe from any email.' : 'Add the client’s email in the details below first.'}</p>

      <h3 className="sub">Details</h3>
      <SiteForm initial={siteFormValues(site)} submitLabel="Save details" busyLabel="Saving…" onSubmit={saveDetails} />

      {can('finance.view') && (
        <>
          <h3 className="sub">Budget</h3>
          <form className="form inline" onSubmit={saveBudget}>
            <p>Current budget: <b>{finance ? cedi(finance.budget) : '–'}</b></p>
            <div className="field"><label htmlFor="st-b">New budget ({currencySymbol()})</label><input id="st-b" type="number" min="0" value={budget} onChange={(e) => setBudgetValue(e.target.value)} /></div>
            <button type="submit" className="btn ghost">Save budget</button>
          </form>
        </>
      )}
      {can('company.settings') && <DeleteProject cid={cid} site={site} />}
    </>
  );
}

// The picture on the project's card and page: an architect's visualization (render) or a photo
function CoverSetting({ cid, site }) {
  const [busy, setBusy] = useState(false);
  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!navigator.onLine) return toast('Uploading an image needs an internet connection.', 'err');
    setBusy(true);
    try { await uploadCover(cid, site.id, file, site.cover); toast('Project image saved.'); } catch (e2) { toast(friendlyError(e2, 'Could not upload the image.'), 'err'); } finally { setBusy(false); }
  }
  return (
    <div className="cover-setting">
      <ProjectCover site={site} />
      <div>
        <p className="small muted">An architect's visualization (3D render) of the finished project works best, or a good photo. It shows on the project's card and at the top of this page.</p>
        <div className="actions">
          <label className={`btn sm ${busy ? 'ghost' : 'gold'}`}>{busy ? 'Uploading…' : site.cover ? 'Replace image' : 'Upload image'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="visually-hidden" onChange={pick} disabled={busy} /></label>
          {site.cover && !busy && <button type="button" className="btn sm ghost" onClick={() => removeCover(cid, site.id, site.cover).then(() => toast('Image removed.')).catch((e) => toast(friendlyError(e), 'err'))}>Remove</button>}
        </div>
      </div>
    </div>
  );
}

// Owner only: delete the project and everything recorded on it. Closing keeps the history.
function DeleteProject({ site }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const matches = name.trim().replace(/s+/g, ' ').toLowerCase() === site.name.trim().replace(/s+/g, ' ').toLowerCase();
  async function go(e) {
    e.preventDefault();
    if (!matches) return setErr('Type the project name exactly as shown.');
    setBusy(true); setErr('');
    try {
      await deleteProject({ siteId: site.id, confirmName: name });
      toast(`${site.name} was deleted.`);
      navigate('/sites', { replace: true });
    } catch (e2) {
      setErr(friendlyError(e2, 'Could not delete the project. Try again.'));
      setBusy(false);
    }
  }
  return (
    <section className="danger-zone">
      <h3 className="sub">Delete project</h3>
      <p className="small">Deleting removes the project and <b>everything recorded on it</b> for good: daily reports and photos, issues, attendance and wages, materials, expenses, the programme, drawings and the 3D model. Nobody can undo it.
        {site.status !== 'closed' ? <> If the work is finished, <b>close</b> the project instead (Status, above): it keeps the history and the site team can no longer add to it.</> : null}</p>
      {!open ? <button type="button" className="btn ghost danger" onClick={() => setOpen(true)}>Delete this project…</button> : (
        <form className="form inline" onSubmit={go}>
          {err && <p className="err" role="alert">{err}</p>}
          <div className="field"><label htmlFor="del-n">Type <b>{site.name}</b> to confirm</label>
            <input id="del-n" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="actions">
            <button type="submit" className="btn danger-solid" disabled={!matches || busy}>{busy ? 'Deleting…' : 'Delete project for good'}</button>
            <button type="button" className="btn ghost" onClick={() => { setOpen(false); setName(''); setErr(''); }} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}

// Photos: every report photo of the project, by week (PhotoGallery)
const PHOTO_PAGE = 60;
function SitePhotos({ cid, site }) {
  const { data, loading, loadingMore, error, hasMore, more } = usePagedQuery(() => cid && siteReportsQuery(cid, site.id, PHOTO_PAGE), [cid, site.id], PHOTO_PAGE);
  if (loading && !data.length) return <Loading what="photos" />;
  if (error) return <ErrorState error={error} what="photos" />;
  return <PhotoGallery reports={data} hasMore={hasMore} loadingMore={loadingMore} onMore={more} issuesQuery={() => siteIssuesQuery(cid, site.id, 200)} />;
}
