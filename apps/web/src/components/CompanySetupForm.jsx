import { useState } from 'react';
import { Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { companySetupInput, friendlyError, guessCountry, validate } from '@siteflow/shared';
import { functions } from '../firebase';
import { CountrySelect } from './CountryFields';

// A new company with you as its Owner: used to finish an unfinished sign-up, and on the Account page
// by someone already in another company who wants to run their own projects. The server switches the
// account to the new company; onDone runs after that.
export default function CompanySetupForm({ name = '', idPrefix = 'cs', submitLabel = 'Create my company', onDone, children, footer }) {
  const [f, setF] = useState(() => ({ companyName: '', name, country: guessCountry() }));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const id = (k) => `${idPrefix}-${k}`;

  async function submit(e) {
    e.preventDefault();
    const v = validate(companySetupInput, { ...f, acceptTerms: f.acceptTerms || undefined });
    if (!v.ok) return setErr(v.error);
    setBusy(true); setErr('');
    try {
      await httpsCallable(functions, 'createCompany')(v.data);
      onDone?.();
    } catch (e2) {
      console.error('createCompany failed', e2);
      setErr(friendlyError(e2));
      setBusy(false);
    }
  }

  return (
    <form className="form card" onSubmit={submit}>
      {children}
      {err && <p className="err" role="alert">{err}</p>}
      <div className="field"><label htmlFor={id('c')}>Company name</label><input id={id('c')} value={f.companyName} onChange={set('companyName')} /></div>
      <div className="field"><label htmlFor={id('n')}>Your name</label><input id={id('n')} value={f.name} onChange={set('name')} /></div>
      <div className="field"><label htmlFor={id('k')}>Country</label><CountrySelect id={id('k')} value={f.country} onChange={({ country }) => setF({ ...f, country })} />
        <p className="hint">Sets your currency, time zone and phone format.</p></div>
      <label className="agree"><input id={id('terms')} type="checkbox" checked={!!f.acceptTerms} onChange={(e) => setF({ ...f, acceptTerms: e.target.checked })} /> <span>I agree to the <Link to="/terms" target="_blank">Terms of Service</Link> and the <Link to="/privacy" target="_blank">Privacy Policy</Link>, for my company.</span></label>
      <button type="submit" className="btn block" disabled={busy}>{busy ? 'Setting up…' : submitLabel}</button>
      {footer}
    </form>
  );
}
