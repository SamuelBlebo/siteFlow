import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { reportId, todayKey } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useDoc } from '../lib/hooks';
import { reportRef } from '../lib/db';
import ReportForm from './ReportForm';

// Today's report on the Daily reports tab, folded away so the history shows first. It opens
// straight away when someone came to write it (Make a report, or a link asking for it).
export default function TodayReport({ cid, site, data, startOpen }) {
  const { me } = useAuth();
  const [open, setOpen] = useState(!!startOpen);
  const box = useRef(null);
  const { key } = useLocation();
  // Make a report pressed again while already on the project: open (if folded) and bring it into view
  useEffect(() => {
    if (!startOpen) return;
    setOpen(true);
    requestAnimationFrame(() => box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [startOpen, key]);
  const { data: mine } = useDoc(() => cid && me && reportRef(cid, site.id, reportId(todayKey(), me)), [cid, site.id, me]);
  const id = `today-report-${site.id}`;
  return (
    <section ref={box} className={`today-report ${open ? 'open' : ''} ${mine ? 'sent' : ''}`}>
      <button type="button" className="today-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className="today-icon" aria-hidden="true">{mine ? '✓' : '+'}</span>
        <span className="grow">
          <b>{mine ? 'Today’s report sent' : 'Write today’s report'}</b>
          <small>{mine ? `Sent at ${mine.time}. ${open ? 'Hide it' : 'View it'}.` : 'Work done, workers, stage, photos and any issues. Takes about two minutes.'}</small>
        </span>
        <span className="chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && <div id={id} className="today-body"><ReportForm cid={cid} site={site} presentCount={data.presentCount} logs={data.logs} /></div>}
    </section>
  );
}
