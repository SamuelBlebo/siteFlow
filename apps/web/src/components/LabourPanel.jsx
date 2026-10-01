import { useState } from 'react';
import AttendanceSheet from './AttendanceSheet';
import AttendanceHistory from './AttendanceHistory';
import WorkersManager from './WorkersManager';

// Attendance, workers and history for one site (site page and site workspace)
export default function LabourPanel({ cid, site, data, canWork }) {
  const [view, setView] = useState('attendance');
  return (
    <>
      <div className="seg" role="group" aria-label="Labour">
        {[['attendance', 'Attendance'], ['workers', 'Workers'], ['history', 'History']].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>
        ))}
      </div>
      {view === 'attendance' && <AttendanceSheet cid={cid} sid={site.id} workers={data.workers} pay={data.pay} readOnly={!canWork} />}
      {view === 'workers' && <WorkersManager cid={cid} sid={site.id} workers={data.allWorkers} pay={data.pay} canWork={canWork} />}
      {view === 'history' && <AttendanceHistory cid={cid} site={site} workers={data.allWorkers} pay={data.pay} />}
    </>
  );
}
