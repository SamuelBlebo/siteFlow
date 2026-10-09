import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { companySetupInput, friendlyError, validate } from '@siteflow/shared';
import { auth, functions } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { useTitle } from '../lib/hooks';
import PasswordInput from '../components/PasswordInput';
import Brand from '../components/Brand';

export default function Signup() {
  useTitle('Create your account');
  const { user } = useAuth();
  const [f, setF] = useState({ company: '', name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  // Signed in already (including a half-finished sign-up): the app takes over. A new company starts with the setup steps.
  if (user && !busy) return <Navigate to={created ? '/welcome' : '/'} replace />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    const v = validate(companySetupInput, { companyName: f.company, name: f.name });
    if (!v.ok) return setErr(v.error);
    if (f.password.length < 8) return setErr('Use a password with at least 8 characters.');
    setBusy(true); setErr('');
    try {
      const { user: u } = await createUserWithEmailAndPassword(auth, f.email.trim(), f.password);
      await updateProfile(u, { displayName: v.data.name });
      // Company and owner profile are created on the server. If this fails, the
      // "Finish setting up" screen lets the user try again without a new account.
      await httpsCallable(functions, 'createCompany')(v.data);
      setCreated(true);
    } catch (e2) {
      console.error('Sign-up failed', e2);
      setErr(friendlyError(e2, 'Could not create the account. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <Brand big />
      <form className="form card" onSubmit={submit}>
        <h1>Create your company account</h1>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="field"><label htmlFor="c">Company name</label><input id="c" value={f.company} onChange={set('company')} /></div>
        <div className="field"><label htmlFor="n">Your name</label><input id="n" value={f.name} onChange={set('name')} /></div>
        <div className="field"><label htmlFor="e">Email</label><input id="e" type="email" autoComplete="email" value={f.email} onChange={set('email')} /></div>
        <div className="field"><label htmlFor="p">Password</label><PasswordInput id="p" autoComplete="new-password" value={f.password} onChange={set('password')} /></div>
        <button type="submit" className="btn block" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        <p className="row-between"><span /><Link to="/login">I already have an account</Link></p>
      </form>
    </div>
  );
}
