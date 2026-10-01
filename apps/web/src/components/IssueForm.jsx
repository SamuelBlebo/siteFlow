import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useQuery } from '../lib/hooks';
import { createIssue, newIssueId, teamQuery, uploadIssuePhotos } from '../lib/db';
import { save } from '../lib/save';
import {
  ISSUE_CATEGORIES, ISSUE_PRIORITIES, ISSUE_PRIORITY_HINTS, ISSUE_PRIORITY_LABELS, can as roleCan, friendlyError, isSiteOpen, issueInput,
  siteTeam, validate,
} from '@siteflow/shared';

// People an issue can be given to on a site: anyone who can do site work there
export function assignableOn(members, sid) {
  const t = siteTeam(members, sid);
  return [...t.allSites, ...t.assigned].filter((m) => roleCan(m.role, 'site.work')).sort((a, b) => a.name.localeCompare(b.name));
}

// Report a problem. sites: where it can be reported (one site, or a choice on the Issues page).
export default function IssueForm({ cid, sites, onDone }) {
  const { user, profile, can } = useAuth();
  const manager = can('sites.manage');
  const open = sites.filter(isSiteOpen);
  const { data: members } = useQuery(() => cid && manager && teamQuery(cid), [cid, manager]);
  const blank = { siteId: open[0]?.id || '', title: '', description: '', priority: '', category: '', location: '', dueDate: '', assignedTo: '' };
  const [f, setF] = useState(blank);
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (!open.length) return <p className="notice warn">Issues can only be reported on open sites.</p>;
  const site = open.find((s) => s.id === f.siteId) || open[0];
  const people = manager ? assignableOn(members, site.id) : [];

  async function submit(e) {
    e.preventDefault();
    const v = validate(issueInput, f);
    if (!v.ok) return setErr(v.error);
    if (files.length && !navigator.onLine) return setErr('Photos need an internet connection. Remove them or try again when you are back online.');
    setBusy(true); setErr('');
    const id = newIssueId(cid, site.id);
    let photos = [];
    try {
      if (files.length) photos = await uploadIssuePhotos(cid, site.id, id, files);
    } catch (e2) {
      console.error('Issue photo upload failed', e2);
      setErr(`Photos could not be uploaded. ${friendlyError(e2)} The issue has not been reported yet.`);
      setBusy(false);
      return;
    }
    try {
      const who = people.find((m) => m.id === f.assignedTo);
      await save(createIssue(cid, site, v.data, { id, uid: user.uid, name: profile.name, photos, assignedTo: who?.id || null, assignedToName: who?.name || '' }), 'Issue');
      setF(blank); setFiles([]);
      onDone?.({ id, siteId: site.id });
    } catch (e2) {
      setErr(e2.message); // form keeps what was typed
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form card" onSubmit={submit}>
      <h3>Report an issue</h3>
      {err && <p className="err" role="alert">{err}</p>}
      {open.length > 1 && (
        <div className="field"><label htmlFor="if-s">Site</label>
          <select id="if-s" value={site.id} onChange={set('siteId')}>{open.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      )}
      <div className="field"><label htmlFor="if-t">What is the problem?</label>
        <input id="if-t" value={f.title} onChange={set('title')} placeholder="e.g. Water pipe burst near the store" /></div>
      <fieldset className="field"><legend>How urgent?</legend>
        <div className="prio-pick">
          {ISSUE_PRIORITIES.map((p) => (
            <label key={p} className={`prio p-${p} ${f.priority === p ? 'on' : ''}`}>
              <input type="radio" name="priority" value={p} checked={f.priority === p} onChange={set('priority')} />
              <b>{ISSUE_PRIORITY_LABELS[p]}</b><small>{ISSUE_PRIORITY_HINTS[p]}</small>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="field"><legend>About</legend>
        <div className="chips">{ISSUE_CATEGORIES.map((c) => (
          <label key={c} className="chip"><input type="radio" name="category" value={c} checked={f.category === c} onChange={set('category')} /> {c}</label>
        ))}</div>
      </fieldset>
      <div className="grid2">
        <div className="field"><label htmlFor="if-l">Where on site (optional)</label><input id="if-l" value={f.location} onChange={set('location')} placeholder="e.g. Block B, first floor" /></div>
        {manager && <div className="field"><label htmlFor="if-due">Fix by (optional)</label><input id="if-due" type="date" value={f.dueDate} onChange={set('dueDate')} /></div>}
      </div>
      <div className="field"><label htmlFor="if-d">Details (optional)</label><textarea id="if-d" value={f.description} onChange={set('description')} style={{ minHeight: 70 }} /></div>
      {manager && (
        <div className="field"><label htmlFor="if-a">Give it to (optional)</label>
          <select id="if-a" value={f.assignedTo} onChange={set('assignedTo')}>
            <option value="">Nobody yet</option>{people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select></div>
      )}
      <div className="field"><label htmlFor="if-p">Photos</label>
        <input id="if-p" type="file" accept="image/*" multiple onChange={(e) => setFiles([...e.target.files].slice(0, 8))} />
        <p className="hint">Up to 8 photos. {files.length ? `${files.length} selected.` : ''}</p></div>
      <div className="row-between" style={{ justifyContent: 'flex-start' }}>
        <button className="btn" disabled={busy}>{busy ? 'Reporting…' : 'Report issue'}</button>
        {onDone && <button type="button" className="btn ghost" onClick={() => onDone(null)} disabled={busy}>Cancel</button>}
      </div>
    </form>
  );
}
