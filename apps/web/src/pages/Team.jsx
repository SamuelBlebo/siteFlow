import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useQuery, useTitle } from '../lib/hooks';
import { activityQuery, sitesCol, teamQuery } from '../lib/db';
import { team } from '../lib/account';
import { toast } from '../lib/save';
import {
  ROLE_DESCRIPTIONS, ROLE_LABELS, assignableRoles, canChangeMember, friendlyError, isSiteScoped,
} from '@siteflow/shared';
import { Empty, ErrorState, Loading } from '../components/States';
import { NotificationLog } from '../components/Notifications';
import PageHead from '../components/PageHead';
import { InviteForm, IssuedLogin } from '../components/Invite';

export default function Team() {
  useTitle('Team');
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
    <>
    <PageHead title="Team" sub="Add people, choose what they can do and which projects they work on. Changes take effect straight away." />
    <section className="wrap">

      {issued && <IssuedLogin issued={issued} onDone={() => setIssued(null)} />}

      <div className="mt">
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
                    <td>{editable && <button type="button" className="btn sm ghost" onClick={() => setEditing(editing === m.id ? null : m.id)}>{editing === m.id ? 'Close' : 'Manage'}</button>}</td>
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
    </>
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
      <div className="actions">
        <button type="button" className="btn" disabled={!!busy} onClick={() => onSave(role, siteIds)}>{busy === 'update' ? 'Saving…' : 'Save changes'}</button>
        <button type="button" className="btn ghost" disabled={!!busy} onClick={onReset}>{busy === 'reset' ? 'Working…' : 'New temporary password'}</button>
        <button type="button" className="btn ghost" disabled={!!busy} onClick={() => onActive(off)}>{busy === 'active' ? 'Working…' : off ? 'Switch on' : 'Switch off'}</button>
        <button type="button" className="btn ghost danger" disabled={!!busy} onClick={onRemove}>{busy === 'remove' ? 'Removing…' : 'Remove from company'}</button>
      </div>
      <p className="hint">Switching someone off signs them out everywhere and blocks their login until you switch them back on.</p>
    </div>
  );
}

