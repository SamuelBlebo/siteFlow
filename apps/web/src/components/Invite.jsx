import { useState } from 'react';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, friendlyError, inviteInput, isSiteScoped, validate, waPhone, getLocale } from '@siteflow/shared';
import { team } from '../lib/account';

// Adding a team member (Team page and the setup steps), and the invitation that goes to them

const linkText = (name, link, kind) => kind === 'reset'
  ? `Hi ${name.split(' ')[0]}, here is your link to set a new SiteFlow password (it works once): ${link}`
  : `Hi ${name.split(' ')[0]}, you've been added to our projects on SiteFlow. Set your password and sign in here (the link works once): ${link}`;
const waLink = (phone, text) => `https://wa.me/${phone ? waPhone(phone) : ''}?text=${encodeURIComponent(text)}`;
const until = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '');

// After inviting someone (or sending a password link): what happened, and the link to share another way
export function IssuedLogin({ issued, onDone }) {
  const [copied, setCopied] = useState(false);
  if (issued.existing) return <AddedExisting issued={issued} onDone={onDone} />;
  const emailed = issued.email === 'sent';
  const copy = async () => { try { await navigator.clipboard.writeText(issued.link); setCopied(true); } catch { setCopied(false); } };
  return (
    <div className={`notice ${emailed ? 'ok' : 'warn'} mt invite-sent`} role="status">
      <p><b>{issued.kind === 'reset' ? `Password link for ${issued.name}` : `Invitation for ${issued.name}`}</b></p>
      <p className="small">{emailed
        ? `Emailed to ${issued.to}. The link works once and expires on ${until(issued.expiresAt)}.`
        : `Email isn't set up yet, so nothing was emailed. Send them this link instead; it works once and expires on ${until(issued.expiresAt)}.`}</p>
      <div className="linkbox"><code>{issued.link}</code><button type="button" className="btn sm ghost" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button></div>
      <div className="actions mt-sm">
        <a className="btn sm" target="_blank" rel="noreferrer" href={waLink(issued.phone, linkText(issued.name, issued.link, issued.kind))}>Send on WhatsApp</a>
        <button type="button" className="btn sm ghost" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

// Someone who already uses SiteFlow with another company: added straight away, same login
function AddedExisting({ issued, onDone }) {
  const emailed = issued.email === 'sent';
  const text = `Hi ${issued.name.split(' ')[0]}, I have added you to our company on SiteFlow. Sign in as usual with ${issued.to} and choose our company from the list at the top of the menu: ${window.location.origin}/login`;
  return (
    <div className="notice ok mt invite-sent" role="status">
      <p><b>{issued.name} added</b></p>
      <p className="small">{issued.to} already has a SiteFlow login (with another company), so they were added straight away with the same login.
        They pick your company from the list at the top of the menu. {emailed ? 'We emailed them to let them know.' : 'Email is not set up yet, so let them know yourself.'}</p>
      <div className="actions mt-sm">
        {!emailed && <a className="btn sm" target="_blank" rel="noreferrer" href={waLink(issued.phone, text)}>Tell them on WhatsApp</a>}
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
      onInvited({ name: v.data.name, to: v.data.email, phone: v.data.phone, link: res.link, email: res.email, expiresAt: res.expiresAt, kind: 'invite', existing: !!res.existing });
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
