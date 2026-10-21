import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { REPORT_DAY_LABELS, filterReports, reportDay, todayKey } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { usePagedQuery, useQuery, useTitle } from '../lib/hooks';
import { companyIssuesQuery, companyReportsQuery, siteIssuesQuery, sitesCol } from '../lib/db';
import { ReportRow } from '../components/ReportCard';
import { Empty, ErrorState, Loading } from '../components/States';
import PageHead from '../components/PageHead';
import ProjectCover from '../components/ProjectCover';
import ReportButton from '../components/ReportButton';
import PhotoGallery from '../components/PhotoGallery';
import Choice from '../components/Choice';
import SearchBox from '../components/SearchBox';

// By project (a card per project) or newest first (one list). Remembered on this browser.
const VIEW_KEY = 'sf.reportsView';
const savedView = () => { try { const v = localStorage.getItem(VIEW_KEY); return v === 'list' || v === 'photos' ? v : 'projects'; } catch { return 'projects'; } };

const PAGE = 50;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return todayKey(d); };
const RANGES = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 3 months'], ['all', 'All time']];

// Every report across the company, for roles that see every site
export default function Reports() {
  useTitle('Daily reports');
  const { cid } = useAuth();
  const { data: sites } = useQuery(() => cid && sitesCol(cid), [cid]);
  const [siteId, setSiteId] = useState('');
  const [range, setRange] = useState('7');
  const [q, setQ] = useState('');
  const [author, setAuthor] = useState('');
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [photosOnly, setPhotosOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false); // phones: site, period and author fold away behind Filters
  const [view, setViewState] = useState(savedView);
  const setView = (v) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* not remembered */ } };
  const from = range === 'all' ? '' : daysAgo(Number(range) - 1);
  // Site and date range are filtered in the query; the rest on the loaded reports
  const { data, loading, loadingMore, error, hasMore, more } = usePagedQuery(() => cid && companyReportsQuery(cid, { siteId, from }, PAGE), [cid, siteId, from], PAGE);

  const authors = useMemo(() => [...new Map(data.map((r) => [r.createdBy, r.createdByName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [data]);
  const shown = filterReports(data, { q, author, withIssues: issuesOnly, withPhotos: photosOnly });
  const withIssues = data.filter((r) => (r.issues || '').trim()).length;
  const reset = (fn) => (e) => fn(e.target.value);

  return (
    <>
    <PageHead title="Daily reports" sub="Every report from every project. Select one to see it in full.">
      <SearchBox value={q} onChange={setQ} placeholder="Search work, issues, notes, stage, weather" label="Search reports" />
    </PageHead>
    <section className="wrap">
      <div id="rf-box" className={`filters${showFilters ? ' open' : ''}`}>
        <button type="button" className="btn ghost sm filters-toggle" aria-expanded={showFilters} aria-controls="rf-box" onClick={() => setShowFilters(!showFilters)}>
          {showFilters ? 'Hide filters' : `Filters${[siteId, range !== '7' && range, author].filter(Boolean).length ? ` (${[siteId, range !== '7' && range, author].filter(Boolean).length})` : ''}`}
        </button>
        <div className="field"><label htmlFor="rf-s">Site</label>
          <select id="rf-s" value={siteId} onChange={reset(setSiteId)}>
            <option value="">All sites</option>
            {[...sites].sort((a, b) => a.name.localeCompare(b.name)).map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === 'closed' ? ' (closed)' : ''}</option>)}
          </select></div>
        <div className="field"><label htmlFor="rf-r">Period</label>
          <select id="rf-r" value={range} onChange={reset(setRange)}>{RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor="rf-a">Sent by</label>
          <select id="rf-a" value={author} onChange={(e) => setAuthor(e.target.value)}>
            <option value="">Anyone</option>
            {authors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select></div>
      </div>
      <div className="toolbar report-tools">
      <div className="chips">
        <label className="chip"><input type="checkbox" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} /> With issues ({withIssues})</label>
        <label className="chip"><input type="checkbox" checked={photosOnly} onChange={(e) => setPhotosOnly(e.target.checked)} /> With photos</label>
      </div>
      <Choice className="seg view-toggle" label="View" value={view} onChange={setView}
        options={[{ value: 'projects', label: 'By project' }, { value: 'list', label: 'Newest first' }, { value: 'photos', label: 'Photos' }]} />
      </div>

      {loading && !data.length ? <Loading what="reports" /> : error ? <ErrorState error={error} what="reports" /> : !data.length ? (
        <Empty title="No reports in this period.">Try a longer period or another site.</Empty>
      ) : (
        <>
          <p className="hint">{shown.length} of {data.length} report{data.length === 1 ? '' : 's'} shown.</p>
          {view === 'photos' ? (
            <PhotoGallery reports={shown} showSite={!siteId} issuesQuery={() => (siteId ? siteIssuesQuery(cid, siteId, 200) : companyIssuesQuery(cid))} siteId={siteId} from={from} />
          ) : !shown.length ? <Empty title="No reports match these filters." /> : view === 'projects'
            ? <ByProject reports={shown} sites={sites} cid={cid} />
            : <ul className="list">{shown.map((r) => <ReportRow key={`${r.siteId}/${r.id}`} r={r} showSite={!siteId} />)}</ul>}
          {hasMore && <button type="button" className="btn ghost mt-sm" disabled={loadingMore} onClick={more}>{loadingMore ? 'Loading…' : 'Show more'}</button>}
        </>
      )}
    </section>
    </>
  );
}

// A card per project: its picture, today's report, counts for the period and its latest reports
function ByProject({ reports, sites, cid }) {
  const groups = [];
  const at = new Map();
  for (const r of reports) {
    if (!at.has(r.siteId)) { at.set(r.siteId, groups.length); groups.push({ siteId: r.siteId, siteName: r.siteName, list: [] }); }
    groups[at.get(r.siteId)].list.push(r);
  }
  return <div className="rgroups">{groups.map((g) => <ProjectReports key={g.siteId} group={g} site={sites.find((s) => s.id === g.siteId)} cid={cid} />)}</div>;
}

function ProjectReports({ group, site, cid }) {
  const [all, setAll] = useState(false);
  const today = todayKey();
  const day = site ? reportDay(site, today) : null;
  const issues = group.list.filter((r) => (r.issues || '').trim()).length;
  const photos = group.list.reduce((n, r) => n + (r.photos?.length || 0), 0);
  const shown = all ? group.list : group.list.slice(0, 3);
  return (
    <section className="rgroup" aria-labelledby={`rg-${group.siteId}`}>
      <header className="rgroup-head">
        {site && <ProjectCover site={site} className="thumb" label={false} />}
        <div className="grow">
          <h2 id={`rg-${group.siteId}`}><Link to={`/sites/${group.siteId}?tab=reports`}>{site?.name || group.siteName}</Link>{site?.sample && <> <span className="pill sample">Sample</span></>}</h2>
          <p className="muted small">{site?.location ? `${site.location} · ` : ''}{group.list.length} report{group.list.length === 1 ? '' : 's'}{issues ? ` · ${issues} with issues` : ''}{photos ? ` · ${photos} photo${photos === 1 ? '' : 's'}` : ''}</p>
        </div>
        {day && day !== 'not_active' && (
          <span className={`pill ${day === 'sent' ? 'ok' : day === 'due' ? 'bad' : day === 'skipped' ? 'ok skipped' : 'calm'}`}>{day === 'sent' ? `Today ${site.lastReportTime}` : day === 'due' ? 'Today missing' : REPORT_DAY_LABELS[day]}</span>
        )}
        <div className="rgroup-actions">
          <Link to={`/sites/${group.siteId}?tab=reports`} className="btn ghost sm">Open project</Link>
          {site && <ReportButton cid={cid} site={site} size="sm" />}
        </div>
      </header>
      <ul className="list">{shown.map((r) => <ReportRow key={`${r.siteId}/${r.id}`} r={r} />)}</ul>
      {group.list.length > 3 && (
        <button type="button" className="rgroup-more" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? 'Show fewer' : `Show all ${group.list.length} reports`}
        </button>
      )}
    </section>
  );
}
