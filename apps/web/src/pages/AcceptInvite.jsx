import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { friendlyError, passwordInput, validate } from '@siteflow/shared';
import { auth } from '../firebase';
import { acceptInvite, inviteInfo } from '../lib/account';
import { useTitle } from '../lib/hooks';
import Brand from '../components/Brand';
import PasswordInput from '../components/PasswordInput';
import { Loading } from '../components/States';

// Opened from an invitation (or password) link: shows who invited them, then they set their own password
export default function AcceptInvite() {
  const { token } = useParams();
  const nav = useNavigate();
  const [info, setInfo] = useState(null);
  const [problem, setProblem] = useState('');
  const [f, setF] = useState({ password: '', confirm: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useTitle(info?.kind === 'reset' ? 'Set a new password' : 'Join your team');

  useEffect(() => {
    inviteInfo({ token }).then(setInfo, (e) => setProblem(friendlyError(e, 'This link is not valid. Ask for a new invitation.')));
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    const v = validate(passwordInput, f);
    if (!v.ok) return setErr(v.error);
    setBusy(true); setErr('');
    try {
      const { email } = await acceptInvite({ token, password: v.data.password });
      if (auth.currentUser) await signOut(auth); // someone else may be signed in on this browser
      await signInWithEmailAndPassword(auth, email, v.data.password);
      nav('/', { replace: true });
    } catch (e2) {
      console.error('Accepting the invitation failed', e2);
      setErr(friendlyError(e2, 'Could not set your password. Try again.'));
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <Brand big home />
      {problem ? (
        <div className="card"><h1>This link doesn't work</h1><p className="muted mt-sm">{problem}</p>
          <p className="mt"><Link to="/login">Go to sign in</Link></p></div>
      ) : !info ? <Loading what="your invitation" /> : info.expired ? (
        <div className="card"><h1>This link has expired</h1>
          <p className="muted mt-sm">Invitation links last 7 days. Ask {info.invitedBy || 'your manager'} at {info.companyName || 'your company'} to send a new one.</p></div>
      ) : (
        <form className="form card" onSubmit={submit}>
          <h1>{info.kind === 'reset' ? 'Set a new password' : `Join ${info.companyName}`}</h1>
          <p className="muted mb">{info.kind === 'reset'
            ? <>For <b>{info.email}</b> at {info.companyName}.</>
            : <>{info.invitedBy} added you, {info.name.split(' ')[0]}, as <b>{info.role.toLowerCase()}</b>. You'll sign in with <b>{info.email}</b>.</>}</p>
          {err && <p className="err" role="alert">{err}</p>}
          <div className="field"><label htmlFor="ip">Choose a password</label><PasswordInput id="ip" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            <p className="hint">At least 8 characters.</p></div>
          <div className="field"><label htmlFor="ic">Type it again</label><PasswordInput id="ic" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></div>
          <button type="submit" className="btn gold block" disabled={busy}>{busy ? 'Setting up…' : info.kind === 'reset' ? 'Save password and sign in' : 'Join and sign in'}</button>
          <p className="hint mt-sm">On site? Install the SiteFlow app and sign in there with the same email and password.</p>
        </form>
      )}
    </div>
  );
}
