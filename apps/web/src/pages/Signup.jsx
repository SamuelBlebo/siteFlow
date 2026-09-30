import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { DEFAULT_MODULES } from '@siteflow/shared';

export default function Signup() {
  const { user, profile } = useAuth();
  const [f, setF] = useState({ company: '', name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (user && profile) return <Navigate to="/" replace />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (!f.company.trim() || !f.name.trim()) return setErr('Enter your company name and your name.');
    if (f.password.length < 8) return setErr('Use a password with at least 8 characters.');
    setBusy(true); setErr('');
    try {
      const { user: u } = await createUserWithEmailAndPassword(auth, f.email.trim(), f.password);
      await updateProfile(u, { displayName: f.name.trim() });
      const b = writeBatch(db);
      b.set(doc(db, 'companies', u.uid), { name: f.company.trim(), ownerId: u.uid, plan: 'trial', modules: DEFAULT_MODULES, createdAt: serverTimestamp() });
      b.set(doc(db, 'users', u.uid), { companyId: u.uid, role: 'owner', name: f.name.trim(), email: f.email.trim(), siteIds: [], createdAt: serverTimestamp() });
      await b.commit();
    } catch (e2) {
      setErr(e2.code === 'auth/email-already-in-use' ? 'That email already has an account. Sign in instead.' : 'Could not create the account. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="brand big"><i aria-hidden="true" />SiteFlow</div>
      <form className="form card" onSubmit={submit}>
        <h1>Create your company account</h1>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="field"><label htmlFor="c">Company name</label><input id="c" value={f.company} onChange={set('company')} /></div>
        <div className="field"><label htmlFor="n">Your name</label><input id="n" value={f.name} onChange={set('name')} /></div>
        <div className="field"><label htmlFor="e">Email</label><input id="e" type="email" value={f.email} onChange={set('email')} /></div>
        <div className="field"><label htmlFor="p">Password</label><input id="p" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} /></div>
        <button className="btn block" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        <p className="row-between"><span /><Link to="/login">I already have an account</Link></p>
      </form>
    </div>
  );
}
