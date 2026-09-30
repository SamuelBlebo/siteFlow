import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { newReportId, sendReport, uploadPhotos } from '../lib/db';
import { save } from '../lib/save';
import { STAGES, friendlyError, reportInput, todayKey, validate } from '@siteflow/shared';

export default function ReportForm({ cid, sid, site, presentCount }) {
  const { user, profile } = useAuth();
  const [text, setText] = useState('');
  const [stage, setStage] = useState(site.stage || STAGES[0]);
  const [progress, setProgress] = useState(site.progress || 0);
  const [issues, setIssues] = useState('');
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState('');
  const [queued, setQueued] = useState(false);
  const [busy, setBusy] = useState(false);

  if (site.lastReportDate === todayKey()) {
    return (
      <p className="notice ok">
        Today's report was sent at {site.lastReportTime}.{' '}
        {queued ? "It's saved on this device and reaches the office when you're back online." : 'The office can see it now.'}
      </p>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const v = validate(reportInput, { text, stage, progress, issues });
    if (!v.ok) return setErr(v.error);
    if (presentCount === 0) return setErr('Mark attendance first so the report shows who was on site.');
    if (files.length && !navigator.onLine) return setErr('Photos need an internet connection. Remove them or send when you are back online.');
    setBusy(true);
    const reportId = newReportId(cid, sid);
    let photos = [];
    try {
      if (files.length) photos = await uploadPhotos(cid, sid, reportId, files);
    } catch (e2) {
      console.error('Photo upload failed', e2);
      setErr(`Photos could not be uploaded. ${friendlyError(e2)} Your report has not been sent yet.`);
      setBusy(false);
      return;
    }
    try {
      const res = await save(sendReport(cid, sid, reportId, {
        ...v.data, photos, workersPresent: presentCount, uid: user.uid, name: profile.name,
      }), "Today's report");
      setQueued(res.queued);
    } catch (e2) {
      setErr(`${e2.message} Your report is still here, so you can try again.`); // form keeps what was typed
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="field">
        <label htmlFor="r-text">Work done today</label>
        <textarea id="r-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Cast lintels over the living room windows" />
      </div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="r-stage">Current stage</label>
          <select id="r-stage" value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="r-prog">Overall progress (%)</label>
          <input id="r-prog" type="number" min="0" max="100" value={progress} onChange={(e) => setProgress(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="r-iss">Issues or delays</label>
        <textarea id="r-iss" value={issues} onChange={(e) => setIssues(e.target.value)} placeholder="Leave empty if none" style={{ minHeight: 60 }} />
      </div>
      <div className="field">
        <label htmlFor="r-ph">Photos</label>
        <input id="r-ph" type="file" accept="image/*" multiple onChange={(e) => setFiles([...e.target.files].slice(0, 8))} />
        <p className="hint">Up to 8 photos. {files.length ? `${files.length} selected.` : ''}</p>
      </div>
      <p className="hint">{presentCount} workers marked present will be included.</p>
      <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>
    </form>
  );
}
