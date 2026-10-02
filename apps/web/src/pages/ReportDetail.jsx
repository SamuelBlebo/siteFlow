import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useTitle } from '../lib/hooks';
import { reportRef } from '../lib/db';
import ReportCard from '../components/ReportCard';
import { ErrorState, Loading } from '../components/States';

// One report in full. Anyone who can see the site can open it (the rules decide).
export default function ReportDetail() {
  useTitle('Daily report');
  const { sid, rid } = useParams();
  const { cid, can } = useAuth();
  const nav = useNavigate();
  const { data: r, loading, error } = useDoc(() => cid && reportRef(cid, sid, rid), [cid, sid, rid]);
  const back = can('sites.all') ? `/sites/${sid}?tab=reports` : `/work/${sid}`;

  if (loading) return <Loading what="report" />;
  return (
    <section className="wrap narrow">
      <button type="button" className="btn sm ghost back" onClick={() => (window.history.length > 1 ? nav(-1) : nav(back))}>Back</button>
      {error ? <ErrorState error={error} what="this report" /> : !r ? (
        <p className="pad">This report doesn't exist or was removed. <Link to={back}>Back to the site</Link></p>
      ) : <ReportCard r={r} showSite />}
    </section>
  );
}
