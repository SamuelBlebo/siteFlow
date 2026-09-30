import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { markAttendance } from '../lib/db';
import { save, toast } from '../lib/save';
import { cedi, dailyWages, presentCount } from '@siteflow/shared';
import { Empty } from './States';

// pay is only passed for roles that can see wages
export default function AttendanceList({ cid, sid, workers, present, pay, readOnly }) {
  const { user, can } = useAuth();
  const [busy, setBusy] = useState({});
  const showPay = can('finance.view') && pay;
  const count = presentCount(present);

  async function toggle(w) {
    setBusy((b) => ({ ...b, [w.id]: true }));
    try {
      await save(markAttendance(cid, sid, { workerId: w.id, present: !present[w.id], uid: user.uid }), `Attendance for ${w.name}`);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy((b) => ({ ...b, [w.id]: false }));
    }
  }

  if (!workers.length) return <Empty title="No workers yet.">{readOnly ? 'The site team adds workers here.' : 'Add workers below to mark attendance.'}</Empty>;
  return (
    <>
      <ul className="list">
        {workers.map((w) => (
          <li key={w.id}>
            <label className="it">
              <span className="grow"><b>{w.name}</b><small>{w.trade}{showPay ? `, ${pay[w.id] ? `${cedi(pay[w.id].dailyRate)} a day` : 'no rate set'}` : ''}</small></span>
              {readOnly
                ? <span className={`pill ${present[w.id] ? 'ok' : 'bad'}`}>{present[w.id] ? 'Present' : 'Not marked'}</span>
                : <input type="checkbox" className="check" checked={!!present[w.id]} disabled={!!busy[w.id]} onChange={() => toggle(w)} aria-label={`${w.name} present`} />}
            </label>
          </li>
        ))}
      </ul>
      <div className="sum"><span>{count} present</span>{showPay && <b>Wages today: {cedi(dailyWages(workers, pay, present))}</b>}</div>
    </>
  );
}
