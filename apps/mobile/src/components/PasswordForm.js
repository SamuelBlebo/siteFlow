import { useState } from 'react';
import { errorCode, friendlyError, passwordInput, validate } from '@siteflow/shared';
import { changePassword } from '../lib/account';
import { Button, ErrorText, Field, Notice } from './ui';

// Change password: on the account screen, and on first sign-in with a temporary password
export default function PasswordForm({ currentLabel = 'Current password', submitLabel = 'Change password', onDone }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!current) return setMsg({ kind: 'err', text: `Enter your ${currentLabel.toLowerCase()}.` });
    const v = validate(passwordInput, { password, confirm });
    if (!v.ok) return setMsg({ kind: 'err', text: v.error });
    if (password === current) return setMsg({ kind: 'err', text: 'Choose a password different from the current one.' });
    setBusy(true); setMsg({});
    try {
      await changePassword(current, v.data.password);
      setCurrent(''); setPassword(''); setConfirm('');
      setMsg({ kind: 'ok', text: 'Password changed.' });
      onDone?.();
    } catch (e) {
      console.warn('Password change failed', e);
      const c = errorCode(e);
      setMsg({ kind: 'err', text: c === 'auth/invalid-credential' || c === 'auth/wrong-password' ? `Your ${currentLabel.toLowerCase()} is not right.` : friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {msg.kind === 'err' ? <ErrorText>{msg.text}</ErrorText> : msg.text ? <Notice>{msg.text}</Notice> : null}
      <Field label={currentLabel} value={current} onChangeText={setCurrent} secureTextEntry autoComplete="password" />
      <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password-new" hint="At least 8 characters." />
      <Field label="New password again" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="password-new" />
      <Button title={busy ? 'Saving…' : submitLabel} onPress={submit} disabled={busy} />
    </>
  );
}
