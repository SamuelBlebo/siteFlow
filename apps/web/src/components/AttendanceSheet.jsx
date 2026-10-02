import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useDoc } from '../lib/hooks';
import { attendanceDoc, markAttendance } from '../lib/db';
import { save, toast } from '../lib/save';
import {
  ATTENDANCE_LABELS, ATTENDANCE_STATUSES, cedi, countByStatus, dailyWages, markAllPresent, prettyDate, todayKey,
} from '@siteflow/shared';
import { Empty, ErrorState, Loading } from './States';

const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return todayKey(d); };

// Mark attendance for a day: one tap per worker, or everyone present at once
export default function AttendanceSheet({ cid, sid, workers, pay, readOnly }) {
  const { user, can } = useAuth();
  const [date, setDate] = useState(todayKey());
  const { data: att, loading, error } = useDoc(() => attendanceDoc(cid, sid, date), [cid, sid, date]);
  const [busy, setBusy] = useState(false);
  const marks = att?.marks || {};
  const showPay = can('finance.view') && pay;
  const c = countByStatus(marks);
  const unmarked = workers.filter((w) => !marks[w.id]).length;

  async function mark(newMarks, label) {
    setBusy(true);
    try {
      await save(markAttendance(cid, sid, { marks: newMarks, uid: user.uid, date }), label);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-head">
        <div className="seg" role="group" aria-label="Day">
          <button type="button" aria-pressed={date === todayKey()} onClick={() => setDate(todayKey())}>Today</button>
          <button type="button" aria-pressed={date === yesterday()} onClick={() => setDate(yesterday())}>Yesterday</button>
        </div>
        <label className="small">Other day <input type="date" value={date} max={todayKey()} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
      </div>
      <h3 className="sub m0">{prettyDate(date)}</h3>
      {loading ? <Loading what="attendance" /> : error ? <ErrorState error={error} what="attendance" /> : !workers.length ? (
        <Empty title="No workers yet.">{readOnly ? 'The site team adds workers.' : 'Add workers under Workers to mark attendance.'}</Empty>
      ) : (
        <>
          {!readOnly && unmarked > 0 && (
            <button type="button" className="btn mb" disabled={busy} onClick={() => mark(markAllPresent(workers, marks), 'Attendance')}>
              Mark the other {unmarked} present
            </button>
          )}
          <ul className="list">
            {workers.map((w) => (
              <li key={w.id}><div className="it">
                <span className="grow"><b>{w.name}</b><small>{w.trade}{showPay ? `, ${pay[w.id] ? `${cedi(pay[w.id].dailyRate)} a day` : 'no rate set'}` : ''}</small></span>
                {readOnly
                  ? <span className={`pill ${marks[w.id] === 'present' ? 'ok' : marks[w.id] === 'late' ? 'warn' : marks[w.id] ? 'bad' : ''}`}>{marks[w.id] ? ATTENDANCE_LABELS[marks[w.id]] : 'Not marked'}</span>
                  : (
                    <div className="seg att" role="group" aria-label={`${w.name} attendance`}>
                      {ATTENDANCE_STATUSES.map((st) => (
                        <button key={st} type="button" className={`s-${st}`} aria-pressed={marks[w.id] === st} disabled={busy}
                          onClick={() => marks[w.id] !== st && mark({ [w.id]: st }, `Attendance for ${w.name}`)}>{ATTENDANCE_LABELS[st]}</button>
                      ))}
                    </div>
                  )}
              </div></li>
            ))}
          </ul>
          <div className="sum">
            <span>{c.present} present, {c.late} late, {c.absent} absent, {c.leave} on leave{unmarked ? `, ${unmarked} not marked` : ''}</span>
            {showPay && <b>Wages: {cedi(dailyWages(workers, pay, marks))}</b>}
          </div>
        </>
      )}
    </>
  );
}
