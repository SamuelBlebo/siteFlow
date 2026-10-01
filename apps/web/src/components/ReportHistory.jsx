import { useState } from 'react';
import { filterReports, missingReportDays, prettyDate, recentWorkDays } from '@siteflow/shared';
import { useQuery } from '../lib/hooks';
import { siteReportsQuery } from '../lib/db';
import { ReportRow } from './ReportCard';
import { Empty, ErrorState, Loading } from './States';

const PAGE = 30;

// One site's reports: the last two weeks at a glance (which days are missing), then the list
export default function ReportHistory({ cid, site }) {
  const [n, setN] = useState(PAGE);
  const [q, setQ] = useState('');
  const [issuesOnly, setIssuesOnly] = useState(false);
  const { data, loading, error } = useQuery(() => cid && siteReportsQuery(cid, site.id, n), [cid, site.id, n]);

  if (loading && !data.length) return <Loading what="reports" />;
  if (error) return <ErrorState error={error} what="reports" />;

  const days = recentWorkDays(14);
  const missing = new Set(site.status === 'active' ? missingReportDays(data.map((r) => r.date), days) : []);
  const shown = filterReports(data, { q, withIssues: issuesOnly });

  return (
    <>
      {site.status === 'active' && (
        <>
          <h3 className="sub">Last two weeks</h3>
          <ol className="days" aria-label="Reports in the last two weeks">
            {[...days].reverse().map((d) => (
              <li key={d} className={missing.has(d) ? 'miss' : 'ok'} title={`${prettyDate(d)}: ${missing.has(d) ? 'no report' : 'report sent'}`}>
                <span>{prettyDate(d).split(' ').slice(0, 2).join(' ')}</span>
              </li>
            ))}
          </ol>
          <p className="hint">{missing.size ? `${missing.size} working day${missing.size === 1 ? '' : 's'} without a report (Sundays not counted).` : 'A report every working day.'}</p>
        </>
      )}
      {!data.length ? <Empty title="No daily reports yet.">They appear here as soon as the site team sends one.</Empty> : (
        <>
          <div className="row-between" style={{ margin: '12px 0' }}>
            <input type="search" aria-label="Search reports" placeholder="Search work, issues, notes or names" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
            <label className="chip"><input type="checkbox" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} /> With issues only</label>
          </div>
          {!shown.length ? <Empty title="No reports match." /> : <ul className="list">{shown.map((r) => <ReportRow key={r.id} r={r} />)}</ul>}
          {data.length >= n && <button className="btn ghost" style={{ marginTop: 12 }} disabled={loading} onClick={() => setN(n + PAGE)}>{loading ? 'Loading…' : 'Show older reports'}</button>}
        </>
      )}
    </>
  );
}
