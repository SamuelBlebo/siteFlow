import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { signOut } from 'firebase/auth';
import { companySetupInput, friendlyError, guessCountry, validate } from '@siteflow/shared';
import { auth, functions } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { useTitle } from '../lib/hooks';
import Brand from '../components/Brand';
import { CountrySelect } from '../components/CountryFields';

// Shown when someone is signed in but has no profile: a sign-up that didn't finish,
// or a login that was never added to a company.
export default function FinishSetup() {
  useTitle('Set up your company');
  const { user } = useAuth();
  const [f, setF] = useState(() => ({ companyName: '', name: user?.displayName || '', country: guessCountry() }));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    const v = validate(companySetupInput, f);
    if (!v.ok) return setErr(v.error);
    setBusy(true); setErr('');
    try {
      await httpsCallable(functions, 'createCompany')(v.data);
      // The profile listener picks up the new profile and the app opens
    } catch (e2) {
      console.error('createCompany failed', e2);
      setErr(friendlyError(e2));
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <Brand big />
      <form className="form card" onSubmit={submit}>
        <h1>Finish setting up</h1>
        <p className="muted">Signed in as {user?.email}. If your company already uses SiteFlow, ask your manager to add you instead, then sign out.</p>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="field"><label htmlFor="fs-c">Company name</label><input id="fs-c" value={f.companyName} onChange={set('companyName')} /></div>
        <div className="field"><label htmlFor="fs-n">Your name</label><input id="fs-n" value={f.name} onChange={set('name')} /></div>
        <div className="field"><label htmlFor="fs-k">Country</label><CountrySelect id="fs-k" value={f.country} onChange={({ country }) => setF({ ...f, country })} />
          <p className="hint">Sets your currency, time zone and phone format.</p></div>
        <button type="submit" className="btn block" disabled={busy}>{busy ? 'Setting up…' : 'Create my company'}</button>
        <p className="row-between"><span /><button type="button" className="linkbtn" onClick={() => signOut(auth)}>Sign out</button></p>
      </form>
    </div>
  );
}
