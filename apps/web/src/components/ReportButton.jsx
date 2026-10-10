import { Link } from 'react-router-dom';
import { reportId, todayKey, isSiteOpen } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useDoc } from '../lib/hooks';
import { reportRef } from '../lib/db';

// "Make a report": straight to today's report form for a project. Once you have sent today's
// report it says so and opens it instead. Shown to everyone who can send reports, on open projects.
export default function ReportButton({ cid, site, size = '' }) {
  const { user, can } = useAuth();
  const allowed = can('site.work') && isSiteOpen(site);
  const { data: mine } = useDoc(() => allowed && cid && user && reportRef(cid, site.id, reportId(todayKey(), user.uid)), [cid, site.id, user?.uid, allowed]);
  if (!allowed) return null;
  const stop = (e) => e.stopPropagation(); // inside clickable table rows
  return mine
    ? <Link to={`/sites/${site.id}?tab=reports`} className={`btn ghost ${size} report-btn sent`} onClick={stop} title="You have sent today's report">✓ Today&rsquo;s report sent</Link>
    : <Link to={`/sites/${site.id}?tab=reports`} className={`btn gold ${size} report-btn`} onClick={stop}>Make a report</Link>;
}
