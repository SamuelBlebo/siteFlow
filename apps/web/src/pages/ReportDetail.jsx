import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { isSiteOpen } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useTitle } from '../lib/hooks';
import { reportRef, siteDoc } from '../lib/db';
import ReportCard from '../components/ReportCard';
import { ReportUpdateForm, RequestChanges, ReviewBox } from '../components/ReportReview';
import { ErrorState, Loading } from '../components/States';

// One report in full. Anyone who can see the site can open it (the rules decide). Managers can send
// it back for changes; its author updates it from here (?edit=1 opens the update straight away).
export default function ReportDetail() {
  useTitle('Daily report');
  const { sid, rid } = useParams();
  const { cid, user, can } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: r, loading, error } = useDoc(() => cid && reportRef(cid, sid, rid), [cid, sid, rid]);
  const { data: site } = useDoc(() => cid && siteDoc(cid, sid), [cid, sid]);
  const [asking, setAsking] = useState(false);
  const back = `/sites/${sid}?tab=reports`;
  const editing = params.get('edit') === '1';
  const setEditing = (on) => setParams(on ? { edit: '1' } : {}, { replace: true });

  if (loading) return <Loading what="report" />;
  const report = r && { ...r, id: rid, siteId: sid };
  const mine = report?.createdBy === user?.uid;
  const open = isSiteOpen(site);
  const canFix = mine && open && report?.review?.status === 'changes_requested';
  const canAsk = can('sites.manage') && open && !mine && report?.review?.status !== 'changes_requested';
  return (
    <section className="wrap narrow">
      <div className="report-actions">
        <button type="button" className="btn sm ghost back" onClick={() => (window.history.length > 1 ? nav(-1) : nav(back))}>Back</button>
        {canAsk && !asking && <button type="button" className="btn sm ghost" onClick={() => setAsking(true)}>Request changes</button>}
      </div>
      {error ? <ErrorState error={error} what="this report" /> : !report ? (
        <p className="pad">This report doesn't exist or was removed. <Link to={back}>Back to the site</Link></p>
      ) : (
        <>
          {asking && <RequestChanges r={report} onDone={() => setAsking(false)} />}
          {canFix && editing ? <ReportUpdateForm cid={cid} r={report} onDone={() => setEditing(false)} /> : <ReviewBox r={report} onEdit={() => setEditing(true)} />}
          <ReportCard r={report} showSite />
        </>
      )}
    </section>
  );
}
