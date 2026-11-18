import { useEffect, useRef, useState } from 'react';
import AttendanceSheet from './AttendanceSheet';
import AttendanceHistory from './AttendanceHistory';
import WorkersManager from './WorkersManager';
import Choice from './Choice';

// Attendance, workers and history for one site (site page and site workspace)
// focusAttendance: bring today's attendance sheet into view (+ New, Attendance)
export default function LabourPanel({ cid, site, data, canWork, focusAttendance = false }) {
  const [view, setView] = useState('attendance');
  const top = useRef(null);
  useEffect(() => { if (focusAttendance) top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, [focusAttendance]);
  return (
    <>
      <span ref={top} />
      <Choice label="Labour" value={view} onChange={setView} options={[['attendance', 'Attendance'], ['workers', 'Workers'], ['history', 'History']].map(([value, label]) => ({ value, label }))} />
      {view === 'attendance' && <AttendanceSheet cid={cid} sid={site.id} workers={data.workers} pay={data.pay} readOnly={!canWork} />}
      {view === 'workers' && <WorkersManager cid={cid} sid={site.id} workers={data.allWorkers} pay={data.pay} canWork={canWork} />}
      {view === 'history' && <AttendanceHistory cid={cid} site={site} workers={data.allWorkers} pay={data.pay} />}
    </>
  );
}
