import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ISSUE_CATEGORIES, ISSUE_PRIORITIES, ISSUE_PRIORITY_LABELS, ISSUE_STATUSES, ISSUE_STATUS_LABELS, filterIssues, sortIssues } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useQuery, useTitle } from '../lib/hooks';
import { companyIssuesQuery, openIssuesQuery, sitesCol } from '../lib/db';
import IssueList from '../components/IssueList';
import IssueForm from '../components/IssueForm';
import { ErrorState, Loading } from '../components/States';
import PageHead from '../components/PageHead';
import SearchBox from '../components/SearchBox';

// Every issue in the company, for roles that see every site. Critical ones at the top.
export default function Issues() {
  useTitle('Issues');
  const { cid, can, me } = useAuth();
  const nav = useNavigate();
  const [status, setStatus] = useState('open');
  const [priority, setPriority] = useState('');
  const [params] = useSearchParams();
  const [siteId, setSiteId] = useState(params.get('site') || '');
  const [category, setCategory] = useState('');
  const [mine, setMine] = useState(false);
  const [showFilters, setShowFilters] = useState(false); // phones: the selects fold away behind Filters
  const [q, setQ] = useState('');
  const [reporting, setReporting] = useState(false);
  const { data: sites } = useQuery(() => cid && sitesCol(cid), [cid]);
  // Open issues live; finished ones only when asked for
  const open = useQuery(() => cid && openIssuesQuery(cid), [cid]);
  const all = useQuery(() => cid && status !== 'open' && companyIssuesQuery(cid), [cid, status !== 'open']);
  const source = status === 'open' ? open : all;
  const shown = sortIssues(filterIssues(source.data, { status, priority, siteId, category, q, assignedTo: mine ? me : '' }));
  const critical = open.data.filter((i) => i.priority === 'critical');

  return (
    <>
    <PageHead title="Issues" sub="Problems reported on site and who is fixing them.">
      <SearchBox value={q} onChange={setQ} placeholder="Search title, details, location, names" label="Search issues" />
      <button type="button" className="btn ghost head-filters-toggle" aria-expanded={showFilters} aria-controls="is-filters" onClick={() => setShowFilters(!showFilters)}>{showFilters ? 'Hide filters' : 'Filters'}</button>
      {can('site.work') && !reporting && <button type="button" className="btn gold" onClick={() => setReporting(true)}>Report an issue</button>}
    </PageHead>
    <section className="wrap">
      {reporting && (
        <div className="mt">
          <IssueForm cid={cid} sites={[...sites].sort((a, b) => a.name.localeCompare(b.name))} onDone={(r) => { setReporting(false); if (r) nav(`/issues/${r.siteId}/${r.id}`); }} />
        </div>
      )}
      {!!critical.length && (
        <button type="button" className={`critical-filter${priority === 'critical' ? ' on' : ''}`} aria-pressed={priority === 'critical'}
          onClick={() => { setPriority(priority === 'critical' ? '' : 'critical'); setStatus('open'); }}>
          <b>{critical.length} critical issue{critical.length === 1 ? '' : 's'} open</b>
          <span>{priority === 'critical' ? 'Show all issues' : 'Show only these'}</span>
        </button>
      )}
      <div className="toolbar report-tools">
        <div id="is-filters" className={`head-filters${showFilters ? ' open' : ''}`} role="group" aria-label="Filters">
          <select className="head-select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Open and in progress ({open.data.length})</option>
            {ISSUE_STATUSES.map((s) => <option key={s} value={s}>{ISSUE_STATUS_LABELS[s]}</option>)}
            <option value="all">All statuses</option>
          </select>
          <select className="head-select" aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">Any priority</option>{ISSUE_PRIORITIES.map((p) => <option key={p} value={p}>{ISSUE_PRIORITY_LABELS[p]}</option>)}
          </select>
          <select className="head-select" aria-label="Site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">All sites</option>{[...sites].sort((a, b) => a.name.localeCompare(b.name)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="head-select" aria-label="About" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">About anything</option>{ISSUE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="chips"><label className="chip"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Given to me</label></div>
      </div>
      {source.loading ? <Loading what="issues" /> : source.error ? <ErrorState error={source.error} what="issues" /> : (
        <IssueList issues={shown} showSite={!siteId} empty={status === 'open' ? 'No open issues.' : 'No issues match.'} />
      )}
    </section>
    </>
  );
}
