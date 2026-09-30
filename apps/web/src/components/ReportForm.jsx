import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { commit, sendReport, uploadPhotos } from '../lib/db';
import { todayKey } from '@siteflow/shared';
import { STAGES } from '@siteflow/shared';

export default function ReportForm({ cid, sid, site, presentCount }) {
  const { user, profile } = useAuth();
  const [text, setText] = useState('');
  const [stage, setStage] = useState(site.stage || STAGES[0]);
  const [progress, setProgress] = useState(site.progress || 0);
  const [issues, setIssues] = useState('');
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (site.lastReportDate === todayKey()) {
    return <p className="notice ok">Today's report was sent at {site.lastReportTime}. The owner can see it now.</p>;
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!text.trim()) return setErr('Describe the work done today before sending.');
    if (presentCount === 0) return setErr('Mark attendance first so the report shows who was on site.');
    const p = Number(progress);
    if (!(p >= 0 && p <= 100)) return setErr('Progress must be between 0 and 100.');
    if (files.length && !navigator.onLine) return setErr('Photos need an internet connection. Remove them or send when you are back online.');
    setBusy(true);
    try {
      const photos = files.length ? await uploadPhotos(cid, sid, files) : [];
      await commit(sendReport(cid, sid, {
        text: text.trim(), stage, progress: p, issues: issues.trim(), photos,
        workersPresent: presentCount, uid: user.uid, name: profile.name,
      }));
    } catch (e2) {
      console.error(e2);
      setErr('Could not send the report. Check your connection and try again.');
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
