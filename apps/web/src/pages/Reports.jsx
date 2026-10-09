import { useMemo, useState } from 'react';
import { filterReports, todayKey } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { usePagedQuery, useQuery, useTitle } from '../lib/hooks';
import { companyReportsQuery, sitesCol } from '../lib/db';
import { ReportRow } from '../components/ReportCard';
import { Empty, ErrorState, Loading } from '../components/States';
import PageHead from '../components/PageHead';

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
  const from = range === 'all' ? '' : daysAgo(Number(range) - 1);
  // Site and date range are filtered in the query; the rest on the loaded reports
  const { data, loading, loadingMore, error, hasMore, more } = usePagedQuery(() => cid && companyReportsQuery(cid, { siteId, from }, PAGE), [cid, siteId, from], PAGE);

  const authors = useMemo(() => [...new Map(data.map((r) => [r.createdBy, r.createdByName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [data]);
  const shown = filterReports(data, { q, author, withIssues: issuesOnly, withPhotos: photosOnly });
  const withIssues = data.filter((r) => (r.issues || '').trim()).length;
  const reset = (fn) => (e) => fn(e.target.value);

  return (
    <>
    <PageHead title="Daily reports" sub="Every report from every project. Select one to see it in full." />
    <section className="wrap">
      <div className="filters">
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
        <div className="field grow"><label htmlFor="rf-q">Search</label>
          <input id="rf-q" type="search" placeholder="Work, issues, notes, stage, weather" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="chips mb">
        <label className="chip"><input type="checkbox" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} /> With issues ({withIssues})</label>
        <label className="chip"><input type="checkbox" checked={photosOnly} onChange={(e) => setPhotosOnly(e.target.checked)} /> With photos</label>
      </div>

      {loading && !data.length ? <Loading what="reports" /> : error ? <ErrorState error={error} what="reports" /> : !data.length ? (
        <Empty title="No reports in this period.">Try a longer period or another site.</Empty>
      ) : (
        <>
          <p className="hint">{shown.length} of {data.length} report{data.length === 1 ? '' : 's'} shown.</p>
          {!shown.length ? <Empty title="No reports match these filters." /> : <ul className="list">{shown.map((r) => <ReportRow key={`${r.siteId}/${r.id}`} r={r} showSite={!siteId} />)}</ul>}
          {hasMore && <button type="button" className="btn ghost mt-sm" disabled={loadingMore} onClick={more}>{loadingMore ? 'Loading…' : 'Show more'}</button>}
        </>
      )}
    </section>
    </>
  );
}
