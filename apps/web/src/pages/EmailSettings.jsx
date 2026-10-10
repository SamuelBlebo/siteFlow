import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { friendlyError } from '@siteflow/shared';
import Brand from '../components/Brand';
import EmailPrefsForm from '../components/EmailPrefs';
import { emailSettings, saveEmailSettings } from '../lib/account';
import { useTitle } from '../lib/hooks';

// Opened from the links at the bottom of every SiteFlow email. No sign-in: the signed link says
// who it is for. "Unsubscribe" lands here too, so a mail scanner opening the link changes nothing.
export default function EmailSettings() {
  useTitle('Email settings');
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const wantsOut = params.get('unsubscribe') === '1';
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    emailSettings({ token }).then(setInfo).catch((e) => setErr(friendlyError(e, 'This link is not valid.')));
  }, [token]);

  async function save(prefs) {
    try { await saveEmailSettings({ token, prefs }); setNote('Your email settings are saved.'); } catch (e) { setErr(friendlyError(e)); throw e; }
  }
  async function client(subscribed) {
    try { await saveEmailSettings({ token, subscribed }); setInfo({ ...info, subscribed }); setNote(subscribed ? 'You will get the daily reports again.' : 'You will not get daily report emails any more.'); } catch (e) { setErr(friendlyError(e)); }
  }

  return (
    <div className="auth wide">
      <Brand big home />
      <section className="card">
        <h1>Email settings</h1>
        {err && <p className="err" role="alert">{err}</p>}
        {note && <p className="notice ok" role="status">{note}</p>}
        {!info && !err && <p className="muted">Loading…</p>}
        {info?.kind === 'client' && (
          <>
            <p className="muted">Daily report emails from <b>{info.companyName}</b> to {info.email}.</p>
            {info.subscribed
              ? <button type="button" className="btn danger-solid" onClick={() => client(false)}>Stop daily report emails</button>
              : <button type="button" className="btn" onClick={() => client(true)}>Get daily report emails again</button>}
          </>
        )}
        {info?.kind === 'person' && (
          <>
            <p className="muted">For {info.name} ({info.email}). These settings apply to every company you use SiteFlow with.</p>
            {wantsOut && <div className="notice warn"><p>To stop all report and issue emails, choose <b>No report emails</b> and <b>No issue emails</b>, then save.</p>
              <button type="button" className="btn ghost sm" onClick={() => save({ reports: 'off', issues: 'off' }).then(() => setInfo({ ...info, prefs: { reports: 'off', issues: 'off' } }))}>Stop all of them now</button></div>}
            <EmailPrefsForm key={JSON.stringify(info.prefs)} initial={info.prefs} onSave={save} />
            <p className="small muted mt">WhatsApp alerts and reminders are set by your company. <Link to="/login">Sign in</Link> to change your other details.</p>
          </>
        )}
      </section>
    </div>
  );
}
