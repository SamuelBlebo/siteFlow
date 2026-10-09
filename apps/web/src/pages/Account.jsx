import { useState } from 'react';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, profileInput, validate, getLocale } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useTitle } from '../lib/hooks';
import { companyDoc, updateMyProfile } from '../lib/db';
import { save, savedText } from '../lib/save';
import { logOut } from '../lib/account';
import PasswordForm from '../components/PasswordForm';
import PageHead from '../components/PageHead';
import ThemeSwitch from '../components/ThemeSwitch';

export default function Account() {
  useTitle('Your account');
  const { user, profile, role, cid } = useAuth();
  const { data: company } = useDoc(() => cid && companyDoc(cid), [cid]);
  const [f, setF] = useState({ name: profile.name || '', phone: profile.phone || '' });
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const v = validate(profileInput, f);
    if (!v.ok) return setMsg({ kind: 'err', text: v.error });
    setBusy(true); setMsg({});
    try {
      const res = await save(updateMyProfile(user.uid, v.data), 'Your details');
      setMsg({ kind: 'ok', text: savedText(res, 'Your details') });
      setF(v.data);
    } catch (e2) {
      setMsg({ kind: 'err', text: e2.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <PageHead title="Your account" />
    <section className="wrap narrow">
      <dl className="cols mt">
        <div><dt>Company</dt><dd>{company?.name || '–'}</dd></div>
        <div><dt>Role</dt><dd>{ROLE_LABELS[role]}</dd></div>
        <div><dt>Sign-in email</dt><dd className="small">{user.email}</dd></div>
      </dl>
      <p className="muted">{ROLE_DESCRIPTIONS[role]} Your role is set by your company's owner or admin.</p>

      <h2 className="sub">Your details</h2>
      <form className="form card" onSubmit={submit}>
        {msg.text && <p className={msg.kind === 'err' ? 'err' : 'notice ok'} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
        <div className="grid2">
          <div className="field"><label htmlFor="a-n">Name</label><input id="a-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="a-p">WhatsApp number</label><input id="a-p" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder={getLocale().phoneExample} />
            <p className="hint">Used for SiteFlow alerts on WhatsApp.</p></div>
        </div>
        <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button>
      </form>

      <h2 className="sub">Appearance</h2>
      <div className="card">
        <p className="muted mb">Light, dark (good at night and on site in the evening), or follow your device. Saved on this browser.</p>
        <ThemeSwitch />
      </div>

      <h2 className="sub">Password</h2>
      <div className="card"><PasswordForm /></div>

      <h2 className="sub">Sign out</h2>
      <p className="muted mb">Sign out of SiteFlow on this device.</p>
      <button type="button" className="btn ghost" onClick={logOut}>Sign out</button>
    </section>
    </>
  );
}
