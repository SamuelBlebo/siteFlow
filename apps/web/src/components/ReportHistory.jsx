import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { filterReports, prettyDate, reportDay, todayKey } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { skipDay } from './ReportDays';
import { usePagedQuery } from '../lib/hooks';
import { siteReportsQuery } from '../lib/db';

// The last 14 calendar days, newest first
function lastDays(n, today = todayKey()) {
  const out = [];
  const d = new Date(`${today}T00:00:00Z`);
  for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1); }
  return out;
}
const STRIP = {
  sent: ['ok', 'report sent: open it'],
  due: ['miss', 'no report'],
  skipped: ['skip', 'skipped: no report needed'],
  day_off: ['off', 'day off'],
  not_active: ['off', 'no report expected'],
};
import { ReportRow } from './ReportCard';
import { Empty, ErrorState, Loading } from './States';

const PAGE = 30;

// One site's reports: the last two weeks at a glance (which days are missing), then the list
export default function ReportHistory({ cid, site }) {
  const [q, setQ] = useState('');
  const [issuesOnly, setIssuesOnly] = useState(false);
  const { data, loading, loadingMore, error, hasMore, more } = usePagedQuery(() => cid && siteReportsQuery(cid, site.id, PAGE), [cid, site.id], PAGE);

  if (loading && !data.length) return <Loading what="reports" />;
  if (error) return <ErrorState error={error} what="reports" />;

  const shown = filterReports(data, { q, withIssues: issuesOnly });

  return (
    <>
      {site.status === 'active' && <DayStrip cid={cid} site={site} reports={data} />}
      {!data.length ? <Empty title="No daily reports yet.">They appear here as soon as the site team sends one.</Empty> : (
        <>
          <div className="toolbar">
            <input type="search" aria-label="Search reports" placeholder="Search work, issues, notes or names" value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="chip"><input type="checkbox" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} /> With issues only</label>
          </div>
          {!shown.length ? <Empty title="No reports match." /> : <ul className="list">{shown.map((r) => <ReportRow key={r.id} r={r} />)}</ul>}
          {hasMore && <button type="button" className="btn ghost mt-sm" disabled={loadingMore} onClick={more}>{loadingMore ? 'Loading…' : 'Show older reports'}</button>}
        </>
      )}
    </>
  );
}

// The last two weeks at a glance. Green: report sent (opens it). Red: missed; managers click to
// skip it (no report needed). Grey: skipped; click to undo. Faint: day off.
function DayStrip({ cid, site, reports }) {
  const { can } = useAuth();
  const nav = useNavigate();
  const manage = can('sites.manage');
  const today = todayKey();
  const byDate = new Map();
  for (const r of reports) if (!byDate.has(r.date)) byDate.set(r.date, r);
  const days = lastDays(14, today).reverse();
  const state = (d) => reportDay({ ...site, lastReportDate: byDate.has(d) ? d : null }, d);
  const missed = days.filter((d) => state(d) === 'due' && d < today).length;
  const skip = (d, on) => skipDay(cid, site, d, on);
  return (
    <>
      <h3 className="sub">Last two weeks</h3>
      <ol className="days" aria-label="Reports in the last two weeks">
        {days.map((d) => {
          const st = state(d);
          const [cls, what] = STRIP[st];
          const label = `${prettyDate(d)}: ${st === 'due' && d === today ? 'today, not in yet' : what}`;
          const act = st === 'sent' ? () => { const r = byDate.get(d); nav(`/reports/${site.id}/${r.id}`); }
            : manage && st === 'due' ? () => skip(d, true)
              : manage && st === 'skipped' ? () => skip(d, false) : null;
          const tip = st === 'due' && manage ? `${label}. Click to skip (no report needed).` : st === 'skipped' && manage ? `${label}. Click to undo.` : label;
          return (
            <li key={d} className={`${cls}${d === today ? ' today' : ''}`}>
              {act ? <button type="button" onClick={act} title={tip} aria-label={tip}>{prettyDate(d).split(' ').slice(0, 2).join(' ')}{st === 'skipped' && <small>skipped{manage ? ' ↺' : ''}</small>}</button>
                : <span title={tip}>{prettyDate(d).split(' ').slice(0, 2).join(' ')}{st === 'skipped' && <small>skipped</small>}</span>}
            </li>
          );
        })}
      </ol>
      <p className="hint">{missed ? `${missed} working day${missed === 1 ? '' : 's'} without a report.` : 'A report every working day.'}{manage ? ' Click a red day to skip it (no work that day); click a skipped day (↺) to undo.' : ''} Green days open the report.</p>
    </>
  );
}
