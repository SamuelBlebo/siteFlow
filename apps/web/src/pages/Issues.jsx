import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ISSUE_CATEGORIES, ISSUE_PRIORITIES, ISSUE_PRIORITY_LABELS, ISSUE_STATUSES, ISSUE_STATUS_LABELS, filterIssues, sortIssues } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useQuery } from '../lib/hooks';
import { companyIssuesQuery, openIssuesQuery, sitesCol } from '../lib/db';
import IssueList from '../components/IssueList';
import IssueForm from '../components/IssueForm';
import { ErrorState, Loading } from '../components/States';

// Every issue in the company, for roles that see every site. Critical ones at the top.
export default function Issues() {
  const { cid, can, user } = useAuth();
  const nav = useNavigate();
  const [status, setStatus] = useState('open');
  const [priority, setPriority] = useState('');
  const [siteId, setSiteId] = useState('');
  const [category, setCategory] = useState('');
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState('');
  const [reporting, setReporting] = useState(false);
  const { data: sites } = useQuery(() => cid && sitesCol(cid), [cid]);
  // Open issues live; finished ones only when asked for
  const open = useQuery(() => cid && openIssuesQuery(cid), [cid]);
  const all = useQuery(() => cid && status !== 'open' && companyIssuesQuery(cid), [cid, status !== 'open']);
  const source = status === 'open' ? open : all;
  const shown = sortIssues(filterIssues(source.data, { status, priority, siteId, category, q, assignedTo: mine ? user.uid : '' }));
  const critical = open.data.filter((i) => i.priority === 'critical');

  return (
    <section className="wrap">
      <div className="head row-between">
        <div><h1>Issues</h1><p className="muted">Problems reported on site and who is fixing them.</p></div>
        {can('site.work') && !reporting && <button className="btn" onClick={() => setReporting(true)}>Report an issue</button>}
      </div>
      {reporting && (
        <div style={{ marginTop: 16 }}>
          <IssueForm cid={cid} sites={[...sites].sort((a, b) => a.name.localeCompare(b.name))} onDone={(r) => { setReporting(false); if (r) nav(`/issues/${r.siteId}/${r.id}`); }} />
        </div>
      )}
      {!!critical.length && (
        <div className="critical-banner" role="alert">
          <b>{critical.length} critical issue{critical.length === 1 ? '' : 's'} open:</b> {critical.map((i) => `${i.title} (${i.siteName})`).join('; ')}
        </div>
      )}
      <div className="filters">
        <div className="field"><label htmlFor="is-st">Status</label>
          <select id="is-st" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Open and in progress ({open.data.length})</option>
            {ISSUE_STATUSES.map((s) => <option key={s} value={s}>{ISSUE_STATUS_LABELS[s]}</option>)}
            <option value="all">All</option>
          </select></div>
        <div className="field"><label htmlFor="is-p">Priority</label>
          <select id="is-p" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">Any</option>{ISSUE_PRIORITIES.map((p) => <option key={p} value={p}>{ISSUE_PRIORITY_LABELS[p]}</option>)}
          </select></div>
        <div className="field"><label htmlFor="is-s">Site</label>
          <select id="is-s" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">All sites</option>{[...sites].sort((a, b) => a.name.localeCompare(b.name)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></div>
        <div className="field"><label htmlFor="is-c">About</label>
          <select id="is-c" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Anything</option>{ISSUE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select></div>
        <div className="field grow"><label htmlFor="is-q">Search</label><input id="is-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, details, location, names" /></div>
      </div>
      <label className="chip" style={{ marginBottom: 12 }}><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Given to me</label>
      {source.loading ? <Loading what="issues" /> : source.error ? <ErrorState error={source.error} what="issues" /> : (
        <IssueList issues={shown} showSite={!siteId} empty={status === 'open' ? 'No open issues.' : 'No issues match.'} />
      )}
    </section>
  );
}
