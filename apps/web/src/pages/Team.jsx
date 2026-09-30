import { useState } from 'react';
import { arrayRemove, arrayUnion, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { useQuery } from '../lib/hooks';
import { sitesCol, teamQuery, userDoc } from '../lib/db';
import { save, toast } from '../lib/save';
import {
  ROLE_DESCRIPTIONS, ROLE_LABELS, assignableRoles, canChangeMember, friendlyError, inviteInput, isSiteScoped, validate,
} from '@siteflow/shared';
import { ErrorState, Loading } from '../components/States';

export default function Team() {
  const { cid, role: myRole, user } = useAuth();
  const roles = assignableRoles(myRole);
  const { data: members, loading, error } = useQuery(() => cid && teamQuery(cid), [cid]);
  const { data: sites } = useQuery(() => cid && sitesCol(cid), [cid]);
  const blank = { name: '', email: '', role: 'supervisor', siteIds: [] };
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const toggleNew = (sid) => setF({ ...f, siteIds: f.siteIds.includes(sid) ? f.siteIds.filter((x) => x !== sid) : [...f.siteIds, sid] });

  async function change(m, patch, label) {
    try {
      await save(updateDoc(userDoc(m.id), patch), label);
    } catch (e) {
      toast(e.message, 'err');
    }
  }
  const toggleSite = (m, sid) => change(m, { siteIds: m.siteIds?.includes(sid) ? arrayRemove(sid) : arrayUnion(sid) }, `Sites for ${m.name}`);

  async function invite(e) {
    e.preventDefault();
    const v = validate(inviteInput, f);
    if (!v.ok) return setMsg({ err: v.error });
    setBusy(true); setMsg(null);
    try {
      const res = await httpsCallable(functions, 'inviteMember')(v.data);
      setMsg({ ok: true, name: v.data.name, email: v.data.email, pw: res.data.tempPassword });
      setF(blank);
    } catch (e2) {
      console.error('inviteMember failed', e2);
      setMsg({ err: friendlyError(e2, 'Could not add this member. Try again.') }); // form keeps what was typed
    } finally { setBusy(false); }
  }

  const shareText = msg?.ok
    ? `Hi ${msg.name}, you've been added to SiteFlow. Sign in at ${window.location.origin} with ${msg.email} and password ${msg.pw}. Change your password after signing in.`
    : '';

  return (
    <section className="wrap">
      <h1>Team</h1>
      <div style={{ marginTop: 16 }}>
        {loading ? <Loading what="your team" /> : error ? <ErrorState error={error} what="your team" /> : (
          <div className="scroll"><table>
            <thead><tr><th>Name</th><th>Role</th><th>Sites</th><th>Access</th></tr></thead>
            <tbody>
              {members.map((m) => {
                const editable = m.id !== user.uid && canChangeMember(myRole, m.role, m.role);
                const off = m.active === false;
                return (
                  <tr key={m.id} className={off ? 'muted' : ''}>
                    <td><b>{m.name}</b><div className="muted small">{m.email}</div></td>
                    <td>{editable
                      ? <select aria-label={`Role for ${m.name}`} value={m.role} onChange={(e) => change(m, { role: e.target.value }, `Role for ${m.name}`)}>
                          {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                      : ROLE_LABELS[m.role] || m.role}
                    </td>
                    <td>{isSiteScoped(m.role)
                      ? <div className="chips">{sites.map((s) => (
                          <label key={s.id} className="chip"><input type="checkbox" disabled={!editable} checked={!!m.siteIds?.includes(s.id)} onChange={() => toggleSite(m, s.id)} /> {s.name}</label>
                        ))}</div>
                      : <span className="muted">All sites</span>}
                    </td>
                    <td>{editable
                      ? <button className="btn sm ghost" onClick={() => change(m, { active: off }, `Access for ${m.name}`)}>{off ? 'Switch on' : 'Switch off'}</button>
                      : <span className="muted small">{off ? 'Off' : 'On'}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>

      <form className="form inline" onSubmit={invite}>
        <h3>Add a team member</h3>
        {msg?.err && <p className="err" role="alert">{msg.err}</p>}
        {msg?.ok && (
          <div className="notice ok">
            <p><b>{msg.name} was added.</b> Temporary password: <code>{msg.pw}</code></p>
            <a className="btn sm" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}>Send login on WhatsApp</a>
          </div>
        )}
        <div className="grid3">
          <div className="field"><label htmlFor="t-n">Name</label><input id="t-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="t-e">Email</label><input id="t-e" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="field"><label htmlFor="t-r">Role</label>
            <select id="t-r" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <p className="hint">{ROLE_DESCRIPTIONS[f.role]}</p></div>
        </div>
        {isSiteScoped(f.role) && (
          <fieldset className="field"><legend>Sites they can access</legend>
            <div className="chips">{sites.map((s) => <label key={s.id} className="chip"><input type="checkbox" checked={f.siteIds.includes(s.id)} onChange={() => toggleNew(s.id)} /> {s.name}</label>)}</div>
          </fieldset>
        )}
        <button className="btn" disabled={busy}>{busy ? 'Adding…' : 'Add member'}</button>
      </form>
    </section>
  );
}
