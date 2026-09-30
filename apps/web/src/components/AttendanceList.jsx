import { useAuth } from '../auth/AuthProvider';
import { commit, saveAttendance } from '../lib/db';
import { cedi } from '@siteflow/shared';

export default function AttendanceList({ cid, sid, workers, attendance, readOnly }) {
  const { user } = useAuth();
  const present = attendance?.present || {};
  const count = Object.values(present).filter(Boolean).length;
  const wages = workers.filter((w) => present[w.id]).reduce((s, w) => s + (w.dailyRate || 0), 0);

  function toggle(w) {
    const next = { ...present, [w.id]: !present[w.id] };
    commit(saveAttendance(cid, sid, { present: next, workers, uid: user.uid }))
      .catch(() => alert('Could not save attendance. Try again.'));
  }

  if (!workers.length) return <p className="empty">No workers yet. Add workers below to mark attendance.</p>;
  return (
    <>
      <ul className="list">
        {workers.map((w) => (
          <li key={w.id}>
            <label className="it">
              <span className="grow"><b>{w.name}</b><small>{w.trade}, {cedi(w.dailyRate)} a day</small></span>
              {readOnly
                ? <span className={`pill ${present[w.id] ? 'ok' : 'bad'}`}>{present[w.id] ? 'Present' : 'Not marked'}</span>
                : <input type="checkbox" className="check" checked={!!present[w.id]} onChange={() => toggle(w)} />}
            </label>
          </li>
        ))}
      </ul>
      <div className="sum"><span>{count} present</span><b>Wages today: {cedi(wages)}</b></div>
    </>
  );
}
