import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { friendlyError } from '@siteflow/shared';
import { useTitle } from '../lib/hooks';
import PasswordInput from '../components/PasswordInput';
import Brand from '../components/Brand';
import GoogleButton from '../components/GoogleButton';

export default function Login() {
  useTitle('Sign in');
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try { await signInWithEmailAndPassword(auth, email.trim(), password); }
    catch (e2) { setMsg(friendlyError(e2, 'Email or password is wrong. Check them and try again.')); }
    finally { setBusy(false); }
  }
  async function reset() {
    if (!email.trim()) return setMsg('Enter your email first, then tap "Forgot password".');
    await sendPasswordResetEmail(auth, email.trim()).catch(() => {});
    setMsg('If that email has an account, a reset link is on its way.');
  }

  return (
    <div className="auth">
      <Brand big home />
      <form className="form card" onSubmit={submit}>
        <h1>Sign in</h1>
        {msg && <p className="err" role="alert">{msg}</p>}
        <GoogleButton onError={setMsg} />
        <div className="or"><span>or</span></div>

        <div className="field"><label htmlFor="e">Email</label><input id="e" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="p">Password</label><PasswordInput id="p" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button type="submit" className="btn block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="row-between"><button type="button" className="linkbtn" onClick={reset}>Forgot password</button><Link to="/signup">Create a company account</Link></p>
      </form>
    </div>
  );
}
