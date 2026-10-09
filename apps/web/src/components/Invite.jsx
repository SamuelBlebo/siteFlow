import { useState } from 'react';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, friendlyError, inviteInput, isSiteScoped, validate, waPhone, getLocale } from '@siteflow/shared';
import { team } from '../lib/account';

// Adding a team member (Team page and the setup steps), and the login to pass on to them

const loginText = (name, email, pw) =>
  `Hi ${name.split(' ')[0]}, your SiteFlow login: ${window.location.origin} Email: ${email} Temporary password: ${pw} You will choose your own password when you sign in.`;
const waLink = (phone, text) => `https://wa.me/${phone ? waPhone(phone) : ''}?text=${encodeURIComponent(text)}`;

export function IssuedLogin({ issued, onDone }) {
  return (
    <div className="notice ok mt">
      <p><b>Login for {issued.name}</b>: {issued.email}, temporary password <code>{issued.pw}</code></p>
      <p className="small">Share it privately. They will choose their own password when they sign in. It is not shown again.</p>
      <div className="actions">
        <a className="btn sm" target="_blank" rel="noreferrer" href={waLink(issued.phone, loginText(issued.name, issued.email, issued.pw))}>Send on WhatsApp</a>
        <button type="button" className="btn sm ghost" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

export function InviteForm({ roles, sites, onInvited }) {
  const blank = { name: '', email: '', phone: '', role: 'supervisor', siteIds: [] };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (sid) => setF({ ...f, siteIds: f.siteIds.includes(sid) ? f.siteIds.filter((x) => x !== sid) : [...f.siteIds, sid] });

  async function submit(e) {
    e.preventDefault();
    const v = validate(inviteInput, f);
    if (!v.ok) return setErr(v.error);
    if (isSiteScoped(v.data.role) && !v.data.siteIds.length) return setErr('Choose at least one site for this person.');
    setBusy(true); setErr('');
    try {
      const res = await team.invite(v.data);
      onInvited({ name: v.data.name, email: v.data.email, phone: v.data.phone, pw: res.tempPassword });
      setF(blank);
    } catch (e2) {
      console.error('inviteMember failed', e2);
      setErr(friendlyError(e2, 'Could not add this member. Try again.')); // form keeps what was typed
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form inline" onSubmit={submit}>
      <h3>Add a team member</h3>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="grid3">
        <div className="field"><label htmlFor="t-n">Name</label><input id="t-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="t-e">Email (used to sign in)</label><input id="t-e" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field"><label htmlFor="t-p">WhatsApp number</label><input id="t-p" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder={getLocale().phoneExample} /></div>
      </div>
      <div className="field"><label htmlFor="t-r">Role</label>
        <select id="t-r" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <p className="hint">{ROLE_DESCRIPTIONS[f.role]}</p></div>
      {isSiteScoped(f.role) && (
        <fieldset className="field"><legend>Sites they can access</legend>
          {!sites.length ? <p className="hint">Add a site first.</p> : <div className="chips">{sites.map((s) => <label key={s.id} className="chip"><input type="checkbox" checked={f.siteIds.includes(s.id)} onChange={() => toggle(s.id)} /> {s.name}</label>)}</div>}
        </fieldset>
      )}
      <button type="submit" className="btn" disabled={busy}>{busy ? 'Adding…' : 'Add member'}</button>
    </form>
  );
}
