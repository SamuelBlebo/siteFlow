import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useQuery } from '../lib/hooks';
import { activityQuery, sitesCol, teamQuery } from '../lib/db';
import { team } from '../lib/account';
import { toast } from '../lib/save';
import {
  ROLE_DESCRIPTIONS, ROLE_LABELS, assignableRoles, canChangeMember, friendlyError, inviteInput, isSiteScoped, validate, waPhone,
} from '@siteflow/shared';
import { Empty, ErrorState, Loading } from '../components/States';
import { NotificationLog } from '../components/Notifications';

const loginText = (name, email, pw) =>
  `Hi ${name.split(' ')[0]}, your SiteFlow login: ${window.location.origin} Email: ${email} Temporary password: ${pw} You will choose your own password when you sign in.`;
const waLink = (phone, text) => `https://wa.me/${phone ? waPhone(phone) : ''}?text=${encodeURIComponent(text)}`;

export default function Team() {
  const { cid, role: myRole, user, can } = useAuth();
  const roles = assignableRoles(myRole);
  const { data: members, loading, error } = useQuery(() => cid && teamQuery(cid), [cid]);
  const { data: sites } = useQuery(() => cid && sitesCol(cid), [cid]);
  const { data: activity } = useQuery(() => cid && can('audit.view') && activityQuery(cid), [cid]);
  const [editing, setEditing] = useState(null);   // member id
  const [issued, setIssued] = useState(null);     // { name, email, phone, pw }
  const [busy, setBusy] = useState('');

  async function run(key, fn, ok) {
    setBusy(key);
    try {
      const res = await fn();
      if (ok) toast(ok);
      return res;
    } catch (e) {
      console.error(key, e);
      toast(friendlyError(e), 'err');
    } finally {
      setBusy('');
    }
  }

  const sorted = [...members].sort((a, b) => (a.active === false) - (b.active === false) || (a.name || '').localeCompare(b.name || ''));

  return (
    <section className="wrap">
      <h1>Team</h1>
      <p className="muted">Add people, choose what they can do and which sites they work on. Changes take effect straight away.</p>

      {issued && (
        <div className="notice ok" style={{ marginTop: 16 }}>
          <p><b>Login for {issued.name}</b>: {issued.email}, temporary password <code>{issued.pw}</code></p>
          <p className="small">Share it privately. They will choose their own password when they sign in. It is not shown again.</p>
          <div className="row-between" style={{ justifyContent: 'flex-start' }}>
            <a className="btn sm" target="_blank" rel="noreferrer" href={waLink(issued.phone, loginText(issued.name, issued.email, issued.pw))}>Send on WhatsApp</a>
            <button className="btn sm ghost" onClick={() => setIssued(null)}>Done</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {loading ? <Loading what="your team" /> : error ? <ErrorState error={error} what="your team" /> : (
          <div className="scroll"><table>
            <thead><tr><th>Name</th><th>Role</th><th>Sites</th><th>Access</th><th /></tr></thead>
            <tbody>
              {sorted.map((m) => {
                const editable = m.id !== user.uid && canChangeMember(myRole, m.role, m.role);
                const off = m.active === false;
                return (
                  <tr key={m.id} className={off ? 'muted' : ''}>
                    <td><b>{m.name}</b>{m.id === user.uid && <span className="muted small"> (you)</span>}<div className="muted small">{m.email}{m.phone ? `, ${m.phone}` : ''}</div>
                      {m.mustChangePassword && <span className="pill warn">Hasn't set a password yet</span>}
                      {!m.phone && m.active !== false && <span className="pill" title="Add a WhatsApp number on their account to send them alerts">No WhatsApp number</span>}</td>
                    <td>{ROLE_LABELS[m.role] || m.role}</td>
                    <td>{isSiteScoped(m.role)
                      ? (m.siteIds?.length ? sites.filter((s) => m.siteIds.includes(s.id)).map((s) => s.name).join(', ') : <span className="pill bad">No sites</span>)
                      : <span className="muted">All sites</span>}</td>
                    <td>{off ? <span className="pill bad">Switched off</span> : <span className="pill ok">Active</span>}</td>
                    <td>{editable && <button className="btn sm ghost" onClick={() => setEditing(editing === m.id ? null : m.id)}>{editing === m.id ? 'Close' : 'Manage'}</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>

      {editing && (() => {
        const m = members.find((x) => x.id === editing);
        return m ? (
          <MemberPanel key={m.id} m={m} roles={roles} sites={sites} busy={busy}
            onSave={(role, siteIds) => run('update', () => team.update({ uid: m.id, role, siteIds }), `${m.name} updated.`)}
            onActive={(active) => run('active', () => team.setActive({ uid: m.id, active }), `${m.name} ${active ? 'switched on' : 'switched off'}.`)}
            onReset={async () => {
              const r = await run('reset', () => team.resetPassword({ uid: m.id }));
              if (r) setIssued({ name: m.name, email: m.email, phone: m.phone, pw: r.tempPassword });
            }}
            onRemove={async () => {
              if (!window.confirm(`Remove ${m.name} from your company? Their login is deleted. Reports they sent are kept.`)) return;
              const r = await run('remove', () => team.remove({ uid: m.id }), `${m.name} removed.`);
              if (r) setEditing(null);
            }} />
        ) : null;
      })()}

      <InviteForm roles={roles} sites={sites} onInvited={setIssued} />

      <h2 className="sub">Messages sent</h2>
      <p className="hint">WhatsApp and email alerts from the last while. Numbers and addresses are partly hidden. {can('company.settings') ? 'Choose which alerts go out on the Company page.' : ''}</p>
      <NotificationLog cid={cid} />

      {can('audit.view') && (
        <>
          <h2 className="sub">Recent team changes</h2>
          {!activity.length ? <Empty title="No changes yet." /> : (
            <ul className="list">
              {activity.map((a) => (
                <li key={a.id}><span className="it"><span className="grow"><b>{a.who}</b> {a.what}<small>{a.at?.toDate ? a.at.toDate().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</small></span></span></li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function MemberPanel({ m, roles, sites, busy, onSave, onActive, onReset, onRemove }) {
  const [role, setRole] = useState(m.role);
  const [siteIds, setSiteIds] = useState(m.siteIds || []);
  const toggle = (sid) => setSiteIds(siteIds.includes(sid) ? siteIds.filter((x) => x !== sid) : [...siteIds, sid]);
  const off = m.active === false;
  return (
    <div className="form inline">
      <h3>Manage {m.name}</h3>
      <div className="grid2">
        <div className="field"><label htmlFor="m-role">Role</label>
          <select id="m-role" value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <p className="hint">{ROLE_DESCRIPTIONS[role]}</p></div>
      </div>
      {isSiteScoped(role) && (
        <fieldset className="field"><legend>Sites they can access</legend>
          {!sites.length ? <p className="hint">No sites yet.</p> : <div className="chips">{sites.map((s) => <label key={s.id} className="chip"><input type="checkbox" checked={siteIds.includes(s.id)} onChange={() => toggle(s.id)} /> {s.name}</label>)}</div>}
        </fieldset>
      )}
      <div className="row-between" style={{ justifyContent: 'flex-start' }}>
        <button className="btn" disabled={!!busy} onClick={() => onSave(role, siteIds)}>{busy === 'update' ? 'Saving…' : 'Save changes'}</button>
        <button className="btn ghost" disabled={!!busy} onClick={onReset}>{busy === 'reset' ? 'Working…' : 'New temporary password'}</button>
        <button className="btn ghost" disabled={!!busy} onClick={() => onActive(off)}>{busy === 'active' ? 'Working…' : off ? 'Switch on' : 'Switch off'}</button>
        <button className="btn ghost danger" disabled={!!busy} onClick={onRemove}>{busy === 'remove' ? 'Removing…' : 'Remove from company'}</button>
      </div>
      <p className="hint">Switching someone off signs them out everywhere and blocks their login until you switch them back on.</p>
    </div>
  );
}

function InviteForm({ roles, sites, onInvited }) {
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
        <div className="field"><label htmlFor="t-p">WhatsApp number</label><input id="t-p" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="024 000 0000" /></div>
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
      <button className="btn" disabled={busy}>{busy ? 'Adding…' : 'Add member'}</button>
    </form>
  );
}
