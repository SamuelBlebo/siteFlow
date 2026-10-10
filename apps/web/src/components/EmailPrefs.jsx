import { useState } from 'react';
import { ISSUE_MAIL_LABELS, REPORT_MAIL_LABELS } from '@siteflow/shared';

// Report and issue emails: what one person gets. Used on the Account page and on the email
// settings page opened from an email (no sign-in).
export default function EmailPrefsForm({ initial, onSave, saveLabel = 'Save email settings' }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setDone(''); setErr('');
    try { await onSave(f); setDone('Saved.'); } catch (e2) { setErr(e2?.message || 'Could not save. Try again.'); } finally { setBusy(false); }
  }
  const group = (name, legend, labels, hint) => (
    <fieldset className="field radios">
      <legend>{legend}</legend>
      {Object.entries(labels).map(([v, label]) => (
        <label key={v} className="radio"><input type="radio" name={name} value={v} checked={f[name] === v} onChange={() => setF({ ...f, [name]: v })} /> {label}</label>
      ))}
      {hint && <p className="hint">{hint}</p>}
    </fieldset>
  );
  return (
    <form className="form card" onSubmit={submit}>
      {err && <p className="err" role="alert">{err}</p>}
      {group('reports', 'Daily reports', REPORT_MAIL_LABELS, 'Each project’s reports for a week arrive as one email conversation. The summary comes at 7pm.')}
      {group('issues', 'Issues', ISSUE_MAIL_LABELS, 'Each issue is one conversation: raised, comments, who it was given to, resolved.')}
      <div className="actions">
        <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : saveLabel}</button>
        {done && <span className="muted small" role="status">{done}</span>}
      </div>
    </form>
  );
}
