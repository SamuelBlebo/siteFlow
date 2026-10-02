import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useQuery } from '../lib/hooks';
import { attendanceRangeQuery } from '../lib/db';
import {
  ATTENDANCE_LABELS, ATTENDANCE_SHORT, attendanceCsv, attendanceTotals, cedi, dateRange, prettyDate, todayKey, wageSheet, wageSheetCsv,
} from '@siteflow/shared';
import { Empty, ErrorState, Loading } from './States';

const shift = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return todayKey(d); };
function periodDates(p) {
  const today = todayKey();
  const now = new Date();
  if (p === 'week') { const back = (now.getDay() + 6) % 7; return [shift(-back), today]; } // since Monday
  if (p === '2weeks') return [shift(-13), today];
  if (p === 'month') return [`${today.slice(0, 8)}01`, today];
  return [shift(-29), today];
}
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

// Attendance over a period: a grid of days, totals per worker, CSV downloads, and wages for finance roles
export default function AttendanceHistory({ cid, site, workers, pay }) {
  const { can } = useAuth();
  const [period, setPeriod] = useState('week');
  const [custom, setCustom] = useState({ from: shift(-6), to: todayKey() });
  const [from, to] = period === 'custom' ? [custom.from, custom.to] : periodDates(period);
  const { data: records, loading, error } = useQuery(() => from && to && from <= to && attendanceRangeQuery(cid, site.id, from, to), [cid, site.id, from, to]);
  const days = dateRange(from, to);
  const byDate = new Map(records.map((r) => [r.date, r.marks || {}]));
  // Workers switched off still appear if they worked in the period
  const shown = workers.filter((w) => w.active !== false || records.some((r) => r.marks?.[w.id]));
  const totals = attendanceTotals(shown, records, days);
  const wages = can('finance.view') && pay ? wageSheet(shown, pay, records) : null;
  const slug = `${site.name.replace(/[^\w]+/g, '-')}-${from}-to-${to}`;

  return (
    <>
      <div className="filters">
        <div className="field"><label htmlFor="ah-p">Period</label>
          <select id="ah-p" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="week">This week</option><option value="2weeks">Last 2 weeks</option>
            <option value="month">This month</option><option value="30">Last 30 days</option><option value="custom">Choose dates</option>
          </select></div>
        {period === 'custom' && (
          <>
            <div className="field"><label htmlFor="ah-f">From</label><input id="ah-f" type="date" value={custom.from} max={todayKey()} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></div>
            <div className="field"><label htmlFor="ah-t">To</label><input id="ah-t" type="date" value={custom.to} max={todayKey()} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></div>
          </>
        )}
      </div>
      {from > to ? <p className="err" role="alert">The start date must be before the end date.</p>
        : loading ? <Loading what="attendance" /> : error ? <ErrorState error={error} what="attendance" />
        : !shown.length ? <Empty title="No workers yet." /> : (
          <>
            <p className="hint">{prettyDate(from)} to {prettyDate(to)}. P present, L late, A absent, LV leave. Present and late count as days worked.</p>
            <div className="scroll"><table className="grid-att">
              <thead><tr><th>Worker</th>{days.map((d) => <th key={d} title={prettyDate(d)}>{prettyDate(d).split(' ').slice(0, 2).join(' ')}</th>)}<th>Worked</th><th>Late</th><th>Absent</th><th>Leave</th>{wages && <th>Wages</th>}</tr></thead>
              <tbody>
                {shown.map((w, i) => (
                  <tr key={w.id}>
                    <td><b>{w.name}</b><div className="muted small">{w.trade}</div></td>
                    {days.map((d) => {
                      const st = byDate.get(d)?.[w.id];
                      return <td key={d} className={st ? `s-${st}` : 'muted'} title={st ? ATTENDANCE_LABELS[st] : 'Not marked'}>{st ? ATTENDANCE_SHORT[st] : '·'}</td>;
                    })}
                    <td><b>{totals[i].worked}</b></td><td>{totals[i].late}</td><td>{totals[i].absent}</td><td>{totals[i].leave}</td>
                    {wages && <td>{cedi(wages.rows.find((r) => r.workerId === w.id)?.total || 0)}</td>}
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div className="actions mt-sm">
              <button type="button" className="btn ghost" onClick={() => download(`attendance-${slug}.csv`, attendanceCsv(shown, records, days))}>Download attendance (CSV)</button>
              {wages && <button type="button" className="btn ghost" onClick={() => download(`wages-${slug}.csv`, wageSheetCsv(wages.rows))}>Download wage sheet (CSV)</button>}
              {wages && <b>Total wages: {cedi(wages.total)}</b>}
            </div>
          </>
        )}
    </>
  );
}
