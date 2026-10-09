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
    { done: !!(company?.phone || company?.location), title: 'Add your company details', to: can('company.settings') ? '/welcome' : null },
    { done: real.length > 0, title: 'Add your first project', to: '/sites/new' },
    { done: members.length > 1, title: 'Invite your team', to: '/team' },
    { done: real.some((s) => s.lastReportDate), title: 'Get the first daily report from site', to: '/work' },
    { done: budgetSet, title: 'Set a project budget', to: can('finance.view') && budgetSet !== null ? (real[0] ? `/sites/${real[0].id}?tab=budget` : '/sites/new') : null },
  ].filter((s) => s.to);
  const left = steps.filter((s) => !s.done).length;
  if (gone || !left || !can('team.manage')) return null;
  const hide = () => { try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* private window: hide for this visit only */ } setGone(true); };
  return (
    <section className="panel getting" aria-labelledby="gs-h">
      <div className="panel-h">
        <div><h2 id="gs-h">Getting started</h2><p>{steps.length - left} of {steps.length} done</p></div>
        <button type="button" className="linkbtn small" onClick={hide}>Hide</button>
      </div>
      <div className="meter mt-sm"><span style={{ width: `${((steps.length - left) / steps.length) * 100}%` }} /></div>
      <ol className="gsteps">
        {steps.map((s) => (
          <li key={s.title} className={s.done ? 'done' : ''}>
            <span className="tick" aria-hidden="true">{s.done ? '✓' : ''}</span>
            {s.done ? <span>{s.title}<span className="visually-hidden"> (done)</span></span> : <Link to={s.to}>{s.title}</Link>}
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
