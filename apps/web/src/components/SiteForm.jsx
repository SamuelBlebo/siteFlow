import { useState } from 'react';
import { STAGES, siteDetailsInput, siteInput, validate } from '@siteflow/shared';

// Site details form, for a new site (withBudget) and for site settings
export default function SiteForm({ initial, withBudget, submitLabel, busyLabel, onSubmit }) {
  const [f, setF] = useState({ stage: STAGES[0], ...initial, ...(withBudget ? { budget: initial?.budget ?? '' } : {}) });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const input = (id, label, k, props = {}) => (
    <div className="field"><label htmlFor={id}>{label}</label><input id={id} value={f[k] ?? ''} onChange={set(k)} {...props} /></div>
  );

  async function submit(e) {
    e.preventDefault();
    const v = validate(withBudget ? siteInput : siteDetailsInput, f);
    if (!v.ok) return setErr(v.error);
    setBusy(true); setErr('');
    try {
      await onSubmit(v.data);
    } catch (e2) {
      setErr(e2.message); // form keeps what was typed
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form card" onSubmit={submit}>
      {err && <p className="err" role="alert">{err}</p>}
      {input('sf-n', 'Site or project name', 'name', { placeholder: 'e.g. Adenta 4-bedroom house' })}
      <div className="grid2">
        {input('sf-l', 'Location', 'location', { placeholder: 'e.g. Adenta, Accra' })}
        <div className="field"><label htmlFor="sf-s">Current stage</label>
          <select id="sf-s" value={f.stage} onChange={set('stage')}>{[...new Set([...STAGES, f.stage].filter(Boolean))].map((s) => <option key={s}>{s}</option>)}</select></div>
      </div>
      <div className="grid2">
        {input('sf-ps', 'Planned start', 'planStart', { type: 'date' })}
        {input('sf-pe', 'Planned finish', 'planEnd', { type: 'date' })}
      </div>
      {withBudget && (
        <>
          {input('sf-b', 'Budget (GH₵)', 'budget', { type: 'number', min: 0 })}
          <p className="hint">The budget is only shown to owners, admins, project managers and finance.</p>
        </>
      )}
      <h3 className="sub">Foreman on site</h3>
      <div className="grid3">
        {input('sf-fn', 'Name', 'foremanName')}
        {input('sf-fp', 'WhatsApp number', 'foremanPhone', { type: 'tel', placeholder: '024 000 0000' })}
        {input('sf-fe', 'Email', 'foremanEmail', { type: 'email' })}
      </div>
      <h3 className="sub">Client</h3>
      <div className="grid3">
        {input('sf-cn', 'Name', 'clientName')}
        {input('sf-cp', 'Phone', 'clientPhone', { type: 'tel' })}
        {input('sf-ce', 'Email', 'clientEmail', { type: 'email' })}
      </div>
      <button type="submit" className="btn" disabled={busy}>{busy ? busyLabel : submitLabel}</button>
    </form>
  );
}
