import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { filterIssues, isSiteOpen, sortIssues } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useQuery } from '../lib/hooks';
import { siteIssuesQuery } from '../lib/db';
import IssueList from './IssueList';
import IssueForm from './IssueForm';
import { ErrorState, Loading } from './States';

// One site's issues (site page and site workspace)
export default function SiteIssues({ cid, site }) {
  const { can } = useAuth();
  const nav = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const [reporting, setReporting] = useState(false);
  const { data, loading, error } = useQuery(() => cid && siteIssuesQuery(cid, site.id), [cid, site.id]);
  const shown = sortIssues(filterIssues(data, { status: showAll ? 'all' : 'open' }));
  const finished = data.length - filterIssues(data, { status: 'open' }).length;
  const canReport = can('site.work') && isSiteOpen(site);

  return (
    <>
      <div className="row-between" style={{ margin: '8px 0 12px' }}>
        {canReport && !reporting ? <button className="btn" onClick={() => setReporting(true)}>Report an issue</button> : <span />}
        {!!finished && <label className="chip"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show {finished} resolved or closed</label>}
      </div>
      {reporting && <div style={{ marginBottom: 16 }}><IssueForm cid={cid} sites={[site]} onDone={(r) => { setReporting(false); if (r) nav(`/issues/${r.siteId}/${r.id}`); }} /></div>}
      {loading ? <Loading what="issues" /> : error ? <ErrorState error={error} what="issues" /> : <IssueList issues={shown} empty={showAll ? 'No issues reported on this site.' : 'No open issues on this site.'} />}
    </>
  );
}
