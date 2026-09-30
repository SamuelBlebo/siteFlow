import { useState } from 'react';
import { arrayRemove, arrayUnion, collection, doc, query, updateDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { useQuery } from '../lib/hooks';
import { sitesCol } from '../lib/db';

const ROLE = { owner: 'Owner', manager: 'Manager', site: 'Site team' };

export default function Team() {
  const { cid } = useAuth();
  const { data: members } = useQuery(() => cid && query(collection(db, 'users'), where('companyId', '==', cid)), [cid]);
  const { data: sites } = useQuery(() => cid && sitesCol(cid), [cid]);
  const [f, setF] = useState({ name: '', email: '', role: 'site', siteIds: [] });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const toggleNew = (sid) => setF({ ...f, siteIds: f.siteIds.includes(sid) ? f.siteIds.filter((x) => x !== sid) : [...f.siteIds, sid] });
  const toggleMember = (m, sid) =>
    updateDoc(doc(db, 'users', m.id), { siteIds: m.siteIds?.includes(sid) ? arrayRemove(sid) : arrayUnion(sid) })
      .catch(() => alert('Could not update sites for this member.'));

  async function invite(e) {
    e.preventDefault();
    if (!f.name.trim() || !f.email.trim()) return setMsg({ err: 'Enter a name and email.' });
    setBusy(true); setMsg(null);
    try {
      const res = await httpsCallable(functions, 'inviteMember')({ ...f, name: f.name.trim(), email: f.email.trim() });
      setMsg({ ok: true, name: f.name.trim(), email: f.email.trim(), pw: res.data.tempPassword });
      setF({ name: '', email: '', role: 'site', siteIds: [] });
    } catch (e2) {
      setMsg({ err: e2.message || 'Could not add this member.' });
    } finally { setBusy(false); }
  }

  const shareText = msg?.ok
    ? `Hi ${msg.name}, you've been added to SiteFlow. Sign in at ${window.location.origin} with ${msg.email} and password ${msg.pw}. Change your password after signing in.`
    : '';

  return (
    <section className="wrap">
      <h1>Team</h1>
      <div className="scroll" style={{ marginTop: 16 }}><table>
        <thead><tr><th>Name</th><th>Role</th><th>Sites</th></tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td><b>{m.name}</b><div className="muted small">{m.email}</div></td>
              <td>{ROLE[m.role]}</td>
              <td>{m.role === 'site'
                ? <div className="chips">{sites.map((s) => (
                    <label key={s.id} className="chip"><input type="checkbox" checked={!!m.siteIds?.includes(s.id)} onChange={() => toggleMember(m, s.id)} /> {s.name}</label>
                  ))}</div>
                : <span className="muted">All sites</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>

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
              <option value="site">Site team (foreman, storekeeper)</option><option value="manager">Manager (sees all sites)</option>
            </select></div>
        </div>
        {f.role === 'site' && (
          <fieldset className="field"><legend>Sites they can access</legend>
            <div className="chips">{sites.map((s) => <label key={s.id} className="chip"><input type="checkbox" checked={f.siteIds.includes(s.id)} onChange={() => toggleNew(s.id)} /> {s.name}</label>)}</div>
          </fieldset>
        )}
        <button className="btn" disabled={busy}>{busy ? 'Adding…' : 'Add member'}</button>
      </form>
    </section>
  );
}
