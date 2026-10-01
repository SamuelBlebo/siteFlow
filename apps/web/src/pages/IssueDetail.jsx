import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ISSUE_PRIORITIES, ISSUE_PRIORITY_LABELS, ISSUE_STATUS_LABELS, commentInput, isOpenIssue, isSiteOpen, issueActions, prettyDate,
  resolveInput, todayKey, validate,
} from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useQuery } from '../lib/hooks';
import { addComment, commentsQuery, issueRef, siteDoc, teamQuery, updateIssue } from '../lib/db';
import { save, toast } from '../lib/save';
import PhotoViewer from '../components/PhotoViewer';
import { IssueStatusPill, PriorityPill } from '../components/IssueList';
import { assignableOn } from '../components/IssueForm';
import { ErrorState, Loading } from '../components/States';

const when = (t) => (t?.toDate ? t.toDate().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Just now');

// One issue: details, photos, what can be done next, and the timeline of comments and changes
export default function IssueDetail() {
  const { sid, id } = useParams();
  const { cid, user, profile, role, can } = useAuth();
  const nav = useNavigate();
  const { data: issue, loading, error } = useDoc(() => cid && issueRef(cid, sid, id), [cid, sid, id]);
  const { data: site } = useDoc(() => cid && siteDoc(cid, sid), [cid, sid]);
  const { data: comments } = useQuery(() => cid && commentsQuery(cid, sid, id), [cid, sid, id]);
  const { data: members } = useQuery(() => cid && can('sites.manage') && teamQuery(cid), [cid]);
  const back = can('sites.all') ? '/issues' : `/work/${sid}`;

  if (loading) return <Loading what="issue" />;
  if (error) return <section className="wrap narrow"><ErrorState error={error} what="this issue" /></section>;
  if (!issue) return <p className="pad">This issue doesn't exist. <Link to={back}>Back</Link></p>;

  const act = issueActions(issue, { uid: user.uid, role }, isSiteOpen(site));
  const me = { uid: user.uid, name: profile.name };
  const change = async (patch, note, label = 'Issue') => {
    try { await save(updateIssue(cid, sid, id, patch, { note, ...me }), label); return true; } catch (e) { toast(e.message, 'err'); return false; }
  };
  const overdue = isOpenIssue(issue.status) && issue.dueDate && issue.dueDate < todayKey();

  return (
    <section className="wrap narrow">
      <button className="btn sm ghost back" onClick={() => (window.history.length > 1 ? nav(-1) : nav(back))}>Back</button>
      <div className={`report issue-card ${issue.priority === 'critical' && isOpenIssue(issue.status) ? 'critical' : ''}`}>
        <div className="row-between">
          <h1 style={{ fontSize: 26 }}>{issue.title}</h1>
          <span className="tags"><PriorityPill p={issue.priority} /> <IssueStatusPill s={issue.status} /> {overdue && <span className="pill bad">Overdue</span>}</span>
        </div>
        <dl className="facts" style={{ marginTop: 10 }}>
          <dt>Site</dt><dd>{can('sites.all') ? <Link to={`/sites/${issue.siteId}?tab=issues`}>{issue.siteName}</Link> : issue.siteName}</dd>
          <dt>About</dt><dd>{issue.category}{issue.location ? `, ${issue.location}` : ''}</dd>
          <dt>Reported</dt><dd>{prettyDate(issue.date)} by {issue.createdByName}</dd>
          <dt>Given to</dt><dd>{issue.assignedToName || 'Nobody yet'}</dd>
          <dt>Fix by</dt><dd>{issue.dueDate ? prettyDate(issue.dueDate) : '–'}</dd>
          {issue.resolution && <><dt>How it was fixed</dt><dd className="prewrap">{issue.resolution}{issue.resolvedByName ? ` (${issue.resolvedByName})` : ''}</dd></>}
        </dl>
        {issue.description && <><h4>Details</h4><p className="prewrap">{issue.description}</p></>}
        {!!issue.photos?.length && <><h4>Photos</h4><PhotoViewer photos={issue.photos} label="Issue photo" /></>}
      </div>

      <Actions issue={issue} act={act} change={change} people={can('sites.manage') ? assignableOn(members, sid) : []} me={me} />

      <h2 className="sub">Timeline</h2>
      <ol className="timeline">
        <li><b>{issue.createdByName}</b> reported this. <small className="muted">{when(issue.createdAt)}</small></li>
        {comments.map((c) => (
          <li key={c.id} className={c.kind === 'update' ? 'update' : ''}>
            <b>{c.createdByName}</b> {c.kind === 'update' ? <span className="muted">{c.text}</span> : <span className="prewrap">{c.text}</span>} <small className="muted">{when(c.createdAt)}</small>
          </li>
        ))}
      </ol>
      {act.comment ? <CommentBox cid={cid} sid={sid} id={id} me={me} /> : <p className="hint">{isSiteOpen(site) ? 'Your role can read this issue but not comment.' : 'This site is closed.'}</p>}
    </section>
  );
}

function Actions({ issue, act, change, people, me }) {
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState('');
  const [err, setErr] = useState('');
  if (!Object.entries(act).some(([k, v]) => v && k !== 'comment' && k !== 'edit')) return null;

  async function resolve(e) {
    e.preventDefault();
    const v = validate(resolveInput, { resolution });
    if (!v.ok) return setErr(v.error);
    const ok = await change({ status: 'resolved', resolution: v.data.resolution, resolvedBy: me.uid, resolvedByName: me.name }, `marked it resolved: ${v.data.resolution}`);
    if (ok) { setResolving(false); setResolution(''); setErr(''); }
  }

  return (
    <div className="form inline">
      <h3>What next</h3>
      <div className="row-between" style={{ justifyContent: 'flex-start' }}>
        {act.start && <button className="btn" onClick={() => change({ status: 'in_progress' }, 'started working on it')}>Start working on it</button>}
        {act.resolve && !resolving && <button className="btn" onClick={() => setResolving(true)}>Mark resolved</button>}
        {act.close && <button className="btn" onClick={() => change({ status: 'closed' }, 'checked the fix and closed it')}>Check and close</button>}
        {act.reopen && <button className="btn ghost" onClick={() => change({ status: 'open' }, 'reopened it')}>Reopen</button>}
      </div>
      {resolving && (
        <form onSubmit={resolve} style={{ marginTop: 12 }}>
          {err && <p className="err" role="alert">{err}</p>}
          <div className="field"><label htmlFor="rs">How was it fixed?</label><textarea id="rs" value={resolution} onChange={(e) => setResolution(e.target.value)} style={{ minHeight: 60 }} /></div>
          <button className="btn">Save as resolved</button> <button type="button" className="btn ghost" onClick={() => setResolving(false)}>Cancel</button>
        </form>
      )}
      {(act.assign || act.setPriority) && (
        <div className="grid3" style={{ marginTop: 12 }}>
          {act.assign && (
            <div className="field"><label htmlFor="ia">Given to</label>
              <select id="ia" value={issue.assignedTo || ''} onChange={(e) => {
                const who = people.find((m) => m.id === e.target.value);
                change({ assignedTo: who?.id || null, assignedToName: who?.name || '' }, who ? `gave it to ${who.name}` : 'took it off everyone');
              }}>
                <option value="">Nobody</option>{people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select></div>
          )}
          {act.setPriority && (
            <div className="field"><label htmlFor="ip">Priority</label>
              <select id="ip" value={issue.priority} onChange={(e) => change({ priority: e.target.value }, `changed priority to ${ISSUE_PRIORITY_LABELS[e.target.value].toLowerCase()}`)}>
                {ISSUE_PRIORITIES.map((p) => <option key={p} value={p}>{ISSUE_PRIORITY_LABELS[p]}</option>)}
              </select></div>
          )}
          {act.setPriority && (
            <div className="field"><label htmlFor="id">Fix by</label>
              <input id="id" type="date" value={issue.dueDate || ''} onChange={(e) => change({ dueDate: e.target.value || null }, e.target.value ? `set the fix-by date to ${prettyDate(e.target.value)}` : 'removed the fix-by date')} /></div>
          )}
        </div>
      )}
      <p className="hint">Status: {ISSUE_STATUS_LABELS[issue.status]}. Open → In progress → Resolved → Closed (checked by a manager).</p>
    </div>
  );
}

function CommentBox({ cid, sid, id, me }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const v = validate(commentInput, { text });
    if (!v.ok) return setErr(v.error);
    setBusy(true); setErr('');
    try {
      await save(addComment(cid, sid, id, v.data.text, me), 'Comment');
      setText('');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form" onSubmit={submit}>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="field"><label htmlFor="cm">Add a comment</label><textarea id="cm" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 60 }} placeholder="Updates, questions, what you need" /></div>
      <button className="btn ghost" disabled={busy}>{busy ? 'Posting…' : 'Post comment'}</button>
    </form>
  );
}
