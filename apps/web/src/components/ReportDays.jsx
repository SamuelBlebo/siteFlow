import { useState } from 'react';
import { DEFAULT_WORK_DAYS, REPORT_DAY_LABELS, WEEKDAY_NAMES, friendlyError, prettyDate, reportDay, todayKey, workDaysOf } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { setSkipDay, setWorkDays } from '../lib/db';
import { save, toast } from '../lib/save';

// Today's report state on the project header, with Skip today / Undo for managers
export function ReportDayPill({ cid, site }) {
  const { can } = useAuth();
  const today = todayKey();
  const st = reportDay(site, today);
  const manage = can('sites.manage');
  const skip = (on) => save(setSkipDay(cid, site, today, on), 'Report days')
    .then(() => toast(on ? 'Today is skipped: no report needed.' : 'Today needs a report again.'))
    .catch((e) => toast(friendlyError(e), 'err'));
  if (st === 'not_active') return null;
  return (
    <span className="report-day">
      {st === 'sent' ? <span className="pill ok">Report sent {site.lastReportTime}</span>
        : st === 'due' ? <span className="pill bad">Report missing</span>
          : <span className="pill calm">{REPORT_DAY_LABELS[st]}</span>}
      {manage && st === 'due' && <button type="button" className="linkish" onClick={() => skip(true)} title="No work on site today (holiday, rain…): nobody is chased for a report">No work today? Skip</button>}
      {manage && st === 'skipped' && <button type="button" className="linkish" onClick={() => skip(false)}>Undo</button>}
    </span>
  );
}

// Project settings: the working days, and single days with no report needed
export function ReportDaysSetting({ cid, site }) {
  const days = workDaysOf(site);
  const [date, setDate] = useState('');
  const toggleDay = (d) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    if (!next.length) return toast('Keep at least one working day, or put the project on hold.', 'err');
    save(setWorkDays(cid, site.id, next), 'Working days').catch((e) => toast(friendlyError(e), 'err'));
  };
  const skip = (d, on) => save(setSkipDay(cid, site, d, on), 'Report days').catch((e) => toast(friendlyError(e), 'err'));
  const today = todayKey();
  const skipped = (site.skipDates || []).filter((d) => d >= today).concat((site.skipDates || []).filter((d) => d < today).slice(-5)).sort();
  const isDefault = days.join() === DEFAULT_WORK_DAYS.join();
  return (
    <div className="report-days">
      <fieldset className="field"><legend>Working days</legend>
        <div className="chips">{[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <label key={d} className={`chip ${days.includes(d) ? 'on' : ''}`}><input type="checkbox" checked={days.includes(d)} onChange={() => toggleDay(d)} /> {WEEKDAY_NAMES[d].slice(0, 3)}</label>
        ))}</div>
        <p className="hint">A daily report is expected on these days{isDefault ? ' (Monday to Saturday is the usual)' : ''}. Other days are never counted as missing.</p>
      </fieldset>
      <div className="field"><label htmlFor="skip-d">Skip a day (holiday, no work on site)</label>
        <div className="row-inline">
          <input id="skip-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button type="button" className="btn ghost sm" disabled={!date} onClick={() => { skip(date, true); setDate(''); }}>Skip this day</button>
        </div>
        {skipped.length ? (
          <ul className="skip-list">{skipped.map((d) => (
            <li key={d}><span>{prettyDate(d)}{d < today ? ' (past)' : ''}</span><button type="button" className="linkish" onClick={() => skip(d, false)} aria-label={`Undo skip on ${prettyDate(d)}`}>Undo</button></li>
          ))}</ul>
        ) : <p className="hint">No days skipped. Managers can also skip today from the top of the project page.</p>}
      </div>
    </div>
  );
}
