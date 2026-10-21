import { useState } from 'react';
import AttendanceSheet from './AttendanceSheet';
import AttendanceHistory from './AttendanceHistory';
import WorkersManager from './WorkersManager';
import Choice from './Choice';

// Attendance, workers and history for one site (site page and site workspace)
export default function LabourPanel({ cid, site, data, canWork }) {
  const [view, setView] = useState('attendance');
  return (
    <>
      <Choice label="Labour" value={view} onChange={setView} options={[['attendance', 'Attendance'], ['workers', 'Workers'], ['history', 'History']].map(([value, label]) => ({ value, label }))} />
      {view === 'attendance' && <AttendanceSheet cid={cid} sid={site.id} workers={data.workers} pay={data.pay} readOnly={!canWork} />}
      {view === 'workers' && <WorkersManager cid={cid} sid={site.id} workers={data.allWorkers} pay={data.pay} canWork={canWork} />}
      {view === 'history' && <AttendanceHistory cid={cid} site={site} workers={data.allWorkers} pay={data.pay} />}
    </>
  );
}
