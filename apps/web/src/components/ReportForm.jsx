import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useDoc } from '../lib/hooks';
import { myReportId, reportRef, sendReport, uploadPhotos } from '../lib/db';
import { save } from '../lib/save';
import {
  REPORT_PHOTO_LIMIT, STAGES, WEATHER, WORK_PHRASES, friendlyError, materialsUsed, reportInput, todayKey, validate,
} from '@siteflow/shared';
import ReportCard from './ReportCard';
import { Loading } from './States';

// Drafts survive a refresh or closed tab (per person, site and day)
const draftKey = (cid, sid, uid) => `siteflow:draft:${cid}:${sid}:${uid}:${todayKey()}`;
const readDraft = (k) => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch { return null; } };
const writeDraft = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };
const clearDraft = (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

export default function ReportForm({ cid, site, presentCount, logs }) {
  const { user, profile } = useAuth();
  const key = draftKey(cid, site.id, user.uid);
  const { data: mine, loading } = useDoc(() => reportRef(cid, site.id, myReportId(user.uid)), [cid, site.id, user.uid]);
  const blank = { text: '', notes: '', issues: '', weather: '', stage: site.stage || STAGES[0], progress: site.progress || 0, workersPresent: '' };
  const [f, setF] = useState(() => ({ ...blank, ...readDraft(key) }));
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  useEffect(() => { writeDraft(key, f); }, [key, f]);

  if (loading) return <Loading what="today's report" />;
  if (mine) {
    return (
      <>
        <p className="notice ok">
          Your report for today was sent at {mine.time}.{' '}
          {queued ? "It's saved on this device and reaches the office when you're back online." : 'The office can see it now.'}
        </p>
        <ReportCard r={mine} />
      </>
    );
  }

  const workers = f.workersPresent === '' ? presentCount : f.workersPresent;
  const materials = materialsUsed(logs);
  const addPhrase = (p) => setF({ ...f, text: f.text.trim() ? `${f.text.trim()}. ${p}` : p });

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const v = validate(reportInput, { ...f, workersPresent: workers });
    if (!v.ok) return setErr(v.error);
    if (files.length && !navigator.onLine) return setErr('Photos need an internet connection. Remove them or send when you are back online.');
    setBusy(true);
    const rid = myReportId(user.uid);
    let photos = [];
    try {
      if (files.length) photos = await uploadPhotos(cid, site.id, rid, files);
    } catch (e2) {
      console.error('Photo upload failed', e2);
      setErr(`Photos could not be uploaded. ${friendlyError(e2)} Your report has not been sent yet.`);
      setBusy(false);
      return;
    }
    try {
      const { done } = sendReport(cid, site, v.data, { uid: user.uid, name: profile.name, photos, materials });
      const res = await save(done, "Today's report");
      clearDraft(key);
      setQueued(res.queued);
    } catch (e2) {
      setErr(`${e2.message} Your report is still here, so you can try again.`); // form and draft keep what was typed
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="field">
        <label htmlFor="r-text">Work done today</label>
        <textarea id="r-text" value={f.text} onChange={set('text')} placeholder="e.g. Cast lintels over the living room windows" />
        <div className="phrases" aria-label="Add common work">{WORK_PHRASES.map((p) => <button type="button" key={p} onClick={() => addPhrase(p)}>+ {p}</button>)}</div>
      </div>
      <div className="grid3">
        <div className="field">
          <label htmlFor="r-w">Workers on site</label>
          <input id="r-w" type="number" min="0" value={workers} onChange={set('workersPresent')} />
          <p className="hint">{presentCount ? `${presentCount} marked present today.` : 'From attendance, or type the number.'}</p>
        </div>
        <div className="field">
          <label htmlFor="r-stage">Current stage</label>
          <select id="r-stage" value={f.stage} onChange={set('stage')}>
            {[...new Set([...STAGES, f.stage])].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="r-prog">Overall progress (%)</label>
          <input id="r-prog" type="number" min="0" max="100" value={f.progress} onChange={set('progress')} />
          <p className="hint">Was {site.progress || 0}%.</p>
        </div>
      </div>
      <fieldset className="field"><legend>Weather</legend>
        <div className="chips">
          {WEATHER.map((w) => (
            <label key={w} className="chip"><input type="radio" name="weather" value={w} checked={f.weather === w} onChange={set('weather')} /> {w}</label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="r-iss">Issues or delays</label>
        <textarea id="r-iss" value={f.issues} onChange={set('issues')} placeholder="Leave empty if none" style={{ minHeight: 60 }} />
      </div>
      <div className="field">
        <label htmlFor="r-notes">Notes</label>
        <textarea id="r-notes" value={f.notes} onChange={set('notes')} placeholder="Visitors, instructions received, plans for tomorrow" style={{ minHeight: 60 }} />
      </div>
      {!!materials.length && (
        <div className="field">
          <p><b>Materials used today</b> (added to the report)</p>
          <ul className="inline-list">{materials.map((m) => <li key={m.materialId}>{m.name}: {m.qty} {m.unit}</li>)}</ul>
        </div>
      )}
      <div className="field">
        <label htmlFor="r-ph">Photos</label>
        <input id="r-ph" type="file" accept="image/*" multiple onChange={(e) => setFiles([...e.target.files].slice(0, REPORT_PHOTO_LIMIT))} />
        <p className="hint">Up to {REPORT_PHOTO_LIMIT} photos, made smaller before upload. {files.length ? `${files.length} selected.` : ''}</p>
      </div>
      <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>
      <p className="draft-note">Your draft is kept on this device until you send it.</p>
    </form>
  );
}
