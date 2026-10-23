import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  REPORT_PHOTO_LIMIT, REVIEW_ITEMS, ROLE_LABELS, STAGES, WEATHER, friendlyError, prettyDate, reportInput, validate,
} from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useQuery } from '../lib/hooks';
import { myChangeRequestsQuery, updateMyReport, uploadPhotos } from '../lib/db';
import { requestReportChanges } from '../lib/account';
import { toast } from '../lib/save';

// Asking for changes to a daily report, and the author's update. The review on the report says what
// was asked, by whom, and whether it has been done.

export function ReviewBox({ r, onEdit }) {
  const { me } = useAuth();
  if (!r.review) return null;
  const v = r.review;
  const asked = <><b>{v.byName}</b> ({ROLE_LABELS[v.byRole] || v.byRole})</>;
  const what = (
    <>
      <ul className="review-items">{v.items.filter((i) => i !== 'other').map((i) => <li key={i}>{REVIEW_ITEMS[i]}</li>)}</ul>
      {v.note && <p className="review-note">“{v.note}”</p>}
    </>
  );
  if (v.status === 'changes_requested') {
    const mine = r.createdBy === me;
    return (
      <div className="review-box warn" role="status">
        <p><b>Changes requested</b> by {asked}:</p>
        {what}
        {mine ? <button type="button" className="btn gold sm mt-sm" onClick={onEdit}>Update report</button>
          : <p className="small muted">Waiting for {r.createdByName} to update it.</p>}
      </div>
    );
  }
  return (
    <div className="review-box ok" role="status">
      <p><b>Updated</b> by {r.createdByName} after {asked} asked for changes:</p>
      {what}
    </div>
  );
}

// Owners, admins and project managers: send the report back with what to change
export function RequestChanges({ r, onDone }) {
  const [f, setF] = useState({ items: [], note: '', whatsapp: true, email: true });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (k) => setF({ ...f, items: f.items.includes(k) ? f.items.filter((x) => x !== k) : [...f.items, k] });
  async function submit(e) {
    e.preventDefault();
    if (!f.items.length) return setErr('Tick what needs changing.');
    if (f.items.includes('other') && f.note.trim().length < 3) return setErr('Say what else needs changing.');
    setBusy(true); setErr('');
    try {
      await requestReportChanges({ siteId: r.siteId, reportId: r.id, ...f });
      toast(`Sent back to ${r.createdByName.split(' ')[0]} for changes.`);
      onDone();
    } catch (e2) { setErr(friendlyError(e2)); } finally { setBusy(false); }
  }
  return (
    <form className="form inline mb" onSubmit={submit}>
      <h3>Ask {r.createdByName.split(' ')[0]} to change this report</h3>
      {err && <p className="err" role="alert">{err}</p>}
      <fieldset className="field"><legend>What needs changing</legend>
        <div className="chips">{Object.entries(REVIEW_ITEMS).map(([k, label]) => (
          <label key={k} className={`chip ${f.items.includes(k) ? 'on' : ''}`}><input type="checkbox" checked={f.items.includes(k)} onChange={() => toggle(k)} /> {label}</label>
        ))}</div>
      </fieldset>
      <div className="field"><label htmlFor="rc-n">Note {f.items.includes('other') ? '' : '(optional)'}</label>
        <input id="rc-n" maxLength={500} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Add photos of the slab before the pour" /></div>
      <fieldset className="field"><legend>Also tell them by</legend>
        <div className="chips">
          <label className="chip"><input type="checkbox" checked={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.checked })} /> WhatsApp</label>
          <label className="chip"><input type="checkbox" checked={f.email} onChange={(e) => setF({ ...f, email: e.target.checked })} /> Email</label>
        </div>
        <p className="hint">They also see it in the app, on the report and on the project.</p>
      </fieldset>
      <div className="actions">
        <button type="submit" className="btn gold" disabled={busy}>{busy ? 'Sending…' : 'Send back for changes'}</button>
        <button type="button" className="btn ghost" onClick={onDone} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

// The author's update: the same fields as the report, filled in, plus more photos
export function ReportUpdateForm({ cid, r, onDone }) {
  const [f, setF] = useState({
    text: r.text || '', notes: r.notes || '', issues: r.issues || '', weather: r.weather || '', stage: r.stage || STAGES[0],
    progress: r.progress ?? 0, workersPresent: r.workersPresent ?? 0,
  });
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const room = REPORT_PHOTO_LIMIT - (r.photos?.length || 0);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    const v = validate(reportInput, f);
    if (!v.ok) return setErr(v.error);
    if (files.length > room) return setErr(`You can add ${room} more photo${room === 1 ? '' : 's'}.`);
    if (files.length && !navigator.onLine) return setErr('Photos need an internet connection.');
    setBusy(true); setErr('');
    try {
      const up = files.length ? await uploadPhotos(cid, r.siteId, r.id, files) : { photos: [], thumbs: [] };
      await updateMyReport(cid, r, v.data, up);
      toast('Report updated. The person who asked has been told.');
      onDone();
    } catch (e2) { setErr(friendlyError(e2, 'Could not update the report. Try again.')); } finally { setBusy(false); }
  }
  return (
    <form className="form inline mb" onSubmit={submit}>
      <h3>Update your report for {prettyDate(r.date)}</h3>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="field"><label htmlFor="ru-t">Work done</label><textarea id="ru-t" rows={4} value={f.text} onChange={set('text')} /></div>
      <div className="grid3">
        <div className="field"><label htmlFor="ru-w">Workers on site</label><input id="ru-w" type="number" min="0" value={f.workersPresent} onChange={set('workersPresent')} /></div>
        <div className="field"><label htmlFor="ru-s">Stage</label><input id="ru-s" maxLength={60} value={f.stage} onChange={set('stage')} /></div>
        <div className="field"><label htmlFor="ru-p">Progress (%)</label><input id="ru-p" type="number" min="0" max="100" value={f.progress} onChange={set('progress')} /></div>
      </div>
      <div className="field"><label htmlFor="ru-we">Weather</label>
        <select id="ru-we" value={f.weather} onChange={set('weather')}><option value="">Not given</option>{WEATHER.map((w) => <option key={w} value={w}>{w}</option>)}</select></div>
      <div className="field"><label htmlFor="ru-i">Issues or delays</label><textarea id="ru-i" rows={2} value={f.issues} onChange={set('issues')} placeholder="Leave empty if none" /></div>
      <div className="field"><label htmlFor="ru-n">Notes</label><textarea id="ru-n" rows={2} value={f.notes} onChange={set('notes')} /></div>
      <div className="field"><label htmlFor="ru-f">Add photos {room > 0 ? `(up to ${room} more)` : '(the report already has the most photos allowed)'}</label>
        <input id="ru-f" type="file" accept="image/*" multiple disabled={room <= 0} onChange={(e) => setFiles([...e.target.files].slice(0, room))} />
        {!!files.length && <p className="hint">{files.length} photo{files.length === 1 ? '' : 's'} to add.</p>}</div>
      <div className="actions">
        <button type="submit" className="btn gold" disabled={busy}>{busy ? 'Saving…' : 'Send updated report'}</button>
        <button type="button" className="btn ghost" onClick={onDone} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

// The author's reports on this project that were sent back for changes (Today tab and Daily reports)
export function MyChangeRequests({ cid, site }) {
  const { me } = useAuth();
  const { data } = useQuery(() => cid && me && myChangeRequestsQuery(cid, site.id, me), [cid, site.id, me]);
  if (!data.length) return null;
  return (
    <div className="notice warn request-banner" role="status">
      {data.map((r) => (
        <p key={r.id}><b>{r.review.byName} ({ROLE_LABELS[r.review.byRole] || r.review.byRole})</b> asked you to update your report for {prettyDate(r.date)}:{' '}
          {r.review.items.filter((i) => i !== 'other').map((i) => REVIEW_ITEMS[i].toLowerCase()).join(', ')}{r.review.note ? ` “${r.review.note}”` : ''}.{' '}
          <Link to={`/reports/${r.siteId}/${r.id}?edit=1`} className="btn sm gold">Update report</Link></p>
      ))}
    </div>
  );
}
