import { useState } from 'react';
import { friendlyError, passwordInput, validate } from '@siteflow/shared';
import { changePassword } from '../lib/account';

// Change password. Used on the account page and for the first sign-in with a temporary password.
export default function PasswordForm({ currentLabel = 'Current password', submitLabel = 'Change password', onDone }) {
  const [f, setF] = useState({ current: '', password: '', confirm: '' });
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (!f.current) return setMsg({ kind: 'err', text: `Enter your ${currentLabel.toLowerCase()}.` });
    const v = validate(passwordInput, { password: f.password, confirm: f.confirm });
    if (!v.ok) return setMsg({ kind: 'err', text: v.error });
    if (f.password === f.current) return setMsg({ kind: 'err', text: 'Choose a password different from the current one.' });
    setBusy(true); setMsg({});
    try {
      await changePassword(f.current, v.data.password);
      setF({ current: '', password: '', confirm: '' });
      setMsg({ kind: 'ok', text: 'Password changed.' });
      onDone?.();
    } catch (e2) {
      console.error('Password change failed', e2);
      const code = e2?.code;
      setMsg({ kind: 'err', text: code === 'auth/invalid-credential' || code === 'auth/wrong-password' ? `Your ${currentLabel.toLowerCase()} is not right.` : friendlyError(e2) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      {msg.text && <p className={msg.kind === 'err' ? 'err' : 'notice ok'} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
      <div className="field"><label htmlFor="pw-c">{currentLabel}</label><input id="pw-c" type="password" autoComplete="current-password" value={f.current} onChange={set('current')} /></div>
      <div className="grid2">
        <div className="field"><label htmlFor="pw-n">New password</label><input id="pw-n" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} /><p className="hint">At least 8 characters.</p></div>
        <div className="field"><label htmlFor="pw-r">New password again</label><input id="pw-r" type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} /></div>
      </div>
      <button className="btn" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}
