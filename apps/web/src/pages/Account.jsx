import { useState } from 'react';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, emailPrefsFor, profileInput, validate, getLocale } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useTitle } from '../lib/hooks';
import { companyDoc, saveEmailPrefs, updateMyProfile } from '../lib/db';
import { save, savedText } from '../lib/save';
import { logOut } from '../lib/account';
import PasswordForm from '../components/PasswordForm';
import EmailPrefsForm from '../components/EmailPrefs';
import PageHead from '../components/PageHead';
import ThemeSwitch from '../components/ThemeSwitch';
import SkinPicker from '../components/SkinPicker';
import { initials } from '../components/TopBar';

export default function Account() {
  useTitle('Your account');
  const { user, profile, role, cid } = useAuth();
  const { data: company } = useDoc(() => cid && companyDoc(cid), [cid]);
  const [f, setF] = useState({ name: profile.name || '', phone: profile.phone || '', callPhone: profile.callPhone || '' });
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
    <section className="wrap narrow acct">
      <div className="acct-head card">
        <span className="acct-avatar" aria-hidden="true">{initials(profile.name)}</span>
        <div className="acct-who">
          <b>{profile.name || 'Your name'}</b>
          <span className="muted">{user.email}</span>
          <span className="acct-role"><span className="pill">{ROLE_LABELS[role]}</span><span className="muted small">{company?.name || ''}</span></span>
        </div>
        <p className="acct-note muted small">{ROLE_DESCRIPTIONS[role]} Your role is set by your company's owner or admin.</p>
      </div>

      <nav className="acct-nav" aria-label="On this page">
        <a href="#details">Details</a><a href="#emails">Emails</a><a href="#appearance">Appearance</a><a href="#password">Password</a>
      </nav>

      <section className="acct-sec" aria-labelledby="details">
        <div className="acct-sec-h"><h2 id="details">Your details</h2><p className="muted">How your team sees and reaches you.</p></div>
        <form className="form card" onSubmit={submit}>
          {msg.text && <p className={msg.kind === 'err' ? 'err' : 'notice ok'} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
          <div className="grid2">
            <div className="field"><label htmlFor="a-n">Name</label><input id="a-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></div>
            <div className="field"><label htmlFor="a-p">WhatsApp number</label><input id="a-p" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder={getLocale().phoneExample} autoComplete="tel" />
              <p className="hint">Used for SiteFlow alerts on WhatsApp.</p></div>
            <div className="field"><label htmlFor="a-c">Phone for calls (if different)</label><input id="a-c" type="tel" value={f.callPhone} onChange={(e) => setF({ ...f, callPhone: e.target.value })} placeholder={getLocale().phoneExample} />
              <p className="hint">Your team taps Call to reach you. Leave empty to use your WhatsApp number.</p></div>
          </div>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button>
        </form>
      </section>

      <section className="acct-sec" aria-labelledby="emails">
        <div className="acct-sec-h"><h2 id="emails">Emails</h2><p className="muted">Daily reports and issues by email, to {user.email}. Every email has a link back to these settings.</p></div>
        <EmailPrefsForm initial={emailPrefsFor(profile.emailPrefs, role)} onSave={(prefs) => save(saveEmailPrefs(user.uid, prefs), 'Email settings')} />
      </section>

      <section className="acct-sec" aria-labelledby="appearance">
        <div className="acct-sec-h"><h2 id="appearance">Appearance</h2><p className="muted">How SiteFlow looks for you.</p></div>
        <div className="card acct-rows">
          <div className="acct-row">
            <div><h3>Skin</h3><p className="muted small">The colour SiteFlow uses for you. It follows you to other browsers and the phone app.</p></div>
            <SkinPicker />
          </div>
          <div className="acct-row">
            <div><h3>Light or dark</h3><p className="muted small">Dark is easier on the eyes at night and on site in the evening. Saved on this browser.</p></div>
            <ThemeSwitch />
          </div>
        </div>
      </section>

      <section className="acct-sec" aria-labelledby="password">
        <div className="acct-sec-h"><h2 id="password">Password</h2><p className="muted">Change the password you sign in with.</p></div>
        <div className="card"><PasswordForm /></div>
      </section>

      <div className="acct-out">
        <div><b>Sign out</b><p className="muted small">Sign out of SiteFlow on this device.</p></div>
        <button type="button" className="btn ghost" onClick={logOut}>Sign out</button>
      </div>
    </section>
    </>
  );
}
