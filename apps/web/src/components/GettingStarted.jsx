import { useState } from 'react';
import { Link } from 'react-router-dom';
import { friendlyError } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useQuery } from '../lib/hooks';
import { teamQuery } from '../lib/db';
import { removeDemo } from '../lib/account';
import { toast } from '../lib/save';

const HIDE_KEY = 'siteflow.gettingStarted.hidden';
const hidden = () => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } };

// First steps for a new company, worked out from what already exists (nothing extra is stored).
// It disappears once everything is done, or when hidden on this browser.
export function GettingStarted({ company, sites, budgetSet }) {
  const { cid, can } = useAuth();
  const [gone, setGone] = useState(hidden);
  const { data: members } = useQuery(() => can('team.manage') && cid && teamQuery(cid), [cid]);
  const real = sites.filter((s) => !s.sample);
  const steps = [
    { done: !!(company?.phone || company?.location), title: 'Company details', why: 'Shown on reports and messages', to: can('company.settings') ? '/welcome' : null, go: 'Add details' },
    { done: real.length > 0, title: 'First project', why: 'Name, place, foreman and budget', to: '/sites/new', go: 'Add project' },
    { done: members.length > 1, title: 'Your team', why: 'Managers, accounts and foremen', to: '/team', go: 'Invite' },
    { done: real.some((s) => s.lastReportDate), title: 'First daily report', why: 'Sent from site on the phone', to: '/work', go: 'Open site work' },
    { done: budgetSet, title: 'Project budget', why: 'So spending can be tracked', to: can('finance.view') && budgetSet !== null ? (real[0] ? `/sites/${real[0].id}?tab=budget` : '/sites/new') : null, go: 'Set budget' },
  ].filter((s) => s.to);
  const left = steps.filter((s) => !s.done).length;
  if (gone || !left || !can('team.manage')) return null;
  const hide = () => { try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* private window: hide for this visit only */ } setGone(true); };
  const done = steps.length - left;
  return (
    <section className="panel getting" aria-labelledby="gs-h">
      <div className="panel-h">
        <div><h2 id="gs-h">Getting started</h2><p>{done} of {steps.length} done. A few steps to get the most from SiteFlow.</p></div>
        <button type="button" className="btn ghost sm" onClick={hide}>Hide</button>
      </div>
      <div className="gs-bar" aria-hidden="true"><span style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol className="gsteps">
        {steps.map((s, i) => (
          <li key={s.title} className={s.done ? 'done' : ''}>
            <span className="gs-mark" aria-hidden="true">
              {s.done ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg> : i + 1}
            </span>
            <b>{s.title}<span className="visually-hidden">{s.done ? ' (done)' : ''}</span></b>
            <small>{s.done ? 'Done' : s.why}</small>
            {!s.done && <Link to={s.to} className="btn sm">{s.go}</Link>}
          </li>
        ))}
      </ol>
    </section>
  );
}

// Shown while the sample projects are in the account
export function SampleBanner() {
  const { can } = useAuth();
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm('Remove the three sample projects and everything in them? Your own projects are not touched.')) return;
    setBusy(true);
    try { const r = await removeDemo(); toast(`Sample projects removed (${r.removed}).`); } catch (e) { toast(friendlyError(e), 'err'); } finally { setBusy(false); }
  }
  return (
    <div className="sample-banner" role="note">
      <span className="pill sample">Sample</span>
      <p>You are looking at <b>sample projects</b>. They show what SiteFlow does with real site data and never send messages.
        {' '}<Link to="/photo-credits">Photo credits</Link></p>
      {can('company.settings') && <button type="button" className="btn ghost sm" onClick={remove} disabled={busy}>{busy ? 'Removing…' : 'Remove sample data'}</button>}
    </div>
  );
}
