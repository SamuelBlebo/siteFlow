import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useQuery } from '../lib/hooks';
import { companyDoc, siteDoc, sitesCol } from '../lib/db';
import { PLAN_LABELS, ROLE_LABELS, isOn, planFor, todayKey } from '@siteflow/shared';
import Brand from './Brand';
import ErrorBoundary from './ErrorBoundary';
import ThemeSwitch from './ThemeSwitch';

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
// Red dot: an active site whose daily report hasn't come in today
const late = (s) => s.status === 'active' && s.lastReportDate !== todayKey();

// The app shell: navy sidebar (company, menu, projects, you) and the page beside it.
// On phones the sidebar folds into a top bar with a sideways-scrolling menu.
export default function Layout() {
  const { cid, profile, role, can, companies, switchCompany } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const main = useRef(null);
  const all = can('sites.all');
  const { data: company } = useDoc(() => cid && companyDoc(cid), [cid]);
  const { data: sites } = useQuery(() => all && cid && sitesCol(cid), [cid, all]);
  const open = sites.filter((s) => s.status !== 'closed').sort((a, b) => a.name.localeCompare(b.name));
  const mod = (k) => isOn(company, k);

  // A new page starts at the top, and screen readers start reading it from its heading
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [pathname]);

  const plan = company ? PLAN_LABELS[company.plan] || PLAN_LABELS[planFor(company.modules || {})] : '';
  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <aside className="side">
        <Brand />
        {company && (companies.length > 1 ? (
          // People in more than one company: pick which one to work in. Each keeps its own role and projects.
          <div className="org pick">
            <label htmlFor="org-pick" className="visually-hidden">Company</label>
            <select id="org-pick" value={cid} onChange={(e) => { navigate('/'); switchCompany(e.target.value); }}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <span>{role ? ROLE_LABELS[role] : ''}, {companies.length} companies</span>
          </div>
        ) : (
          <div className="org"><b>{company.name}</b>
            <span>{all ? `${plan} plan, ${open.length} project${open.length === 1 ? '' : 's'}` : 'Site workspace'}</span></div>
        ))}
        <nav className="snav" aria-label="Main">
          {all && <NavLink to="/" end>Dashboard</NavLink>}
          {all && <NavLink to="/sites" end>Projects</NavLink>}
          {all && <NavLink to="/reports">Daily reports</NavLink>}
          {all && <NavLink to="/issues">Issues</NavLink>}
          {can('finance.view') && mod('budget') && <NavLink to="/finance">Finance</NavLink>}
          <NavLink to="/work">{all ? 'Site work' : 'My sites'}</NavLink>
          {can('team.manage') && <NavLink to="/team">Team</NavLink>}
          {can('company.settings') && <NavLink to="/modules">Modules</NavLink>}
          {can('company.settings') && <NavLink to="/reminders">Reminders</NavLink>}
          {can('company.settings') && <NavLink to="/company">Company</NavLink>}
          {all && !!open.length && <span className="lbl">Projects</span>}
          {all && open.map((s) => (
            <NavLink key={s.id} to={`/sites/${s.id}`} className="site-link" title={late(s) ? `${s.name}: today's report is missing` : s.name}>
              <span className="dot" style={{ background: late(s) ? 'var(--bad)' : 'var(--ok)' }} aria-hidden="true" /><span>{s.name}</span>{s.sample && <i className="tag">Sample</i>}
            </NavLink>
          ))}
          {!all && (profile?.siteIds || []).map((sid) => <MySiteLink key={sid} cid={cid} sid={sid} />)}
        </nav>
        <ThemeSwitch compact />
        <div className="me">
          <NavLink to="/account" title="Your account">
            <span className="avatar">{initials(profile?.name)}</span>
            <span className="who-text"><b>{profile?.name}</b><span>{role ? ROLE_LABELS[role] : ''}</span></span>
          </NavLink>
          <button type="button" className="signout" onClick={() => signOut(auth)}>Sign out</button>
        </div>
      </aside>
      {/* A crash in one page keeps the menu working; moving to another page clears it */}
      <main id="main" className="main" ref={main} tabIndex={-1}><ErrorBoundary key={pathname}><Outlet /></ErrorBoundary></main>
    </div>
  );
}

// Site teams see their own sites in the sidebar (they can only read the ones they're assigned to)
function MySiteLink({ cid, sid }) {
  const { data: s } = useDoc(() => cid && siteDoc(cid, sid), [cid, sid]);
  if (!s || s.status === 'closed') return null;
  return (
    <NavLink to={`/work/${sid}`} className="site-link">
      <span className="dot" style={{ background: late(s) ? 'var(--bad)' : 'var(--ok)' }} aria-hidden="true" /><span>{s.name}</span>
    </NavLink>
  );
}
