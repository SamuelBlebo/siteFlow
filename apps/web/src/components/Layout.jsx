import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useQuery } from '../lib/hooks';
import { companyDoc, siteDoc, sitesCol } from '../lib/db';
import { PLAN_LABELS, ROLE_LABELS, isOn, planFor, reportDay, todayKey } from '@siteflow/shared';
import Brand from './Brand';
import ErrorBoundary from './ErrorBoundary';
import Icon from './Icons';
import TopBar, { initials } from './TopBar';
import { usePins } from './PinButton';
import { useProfileSkin } from '../lib/skin';
// Red dot: an active site whose daily report hasn't come in today
const late = (s) => reportDay(s, todayKey()) === 'due';

// The app shell: a white sidebar that stays put (company, menu in groups, projects, you), and beside
// it the top bar and the page. On phones the sidebar folds into a top bar with a sideways-scrolling menu.
export default function Layout() {
  const { cid, profile, role, can, companies, switchCompany } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const main = useRef(null);
  const all = can('sites.all');
  const { data: company } = useDoc(() => cid && companyDoc(cid), [cid]);
  const { data: sites } = useQuery(() => all && cid && sitesCol(cid), [cid, all]);
  const pinned = usePins();
  const open = sites.filter((s) => s.status !== 'closed').sort((a, b) => (pinned(b.id) - pinned(a.id)) || a.name.localeCompare(b.name));
  const mod = (k) => isOn(company, k);
  useProfileSkin(profile?.skin);

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
            <span>{all ? `${plan} plan, ${open.length} project${open.length === 1 ? '' : 's'}` : `${role ? ROLE_LABELS[role] : ''}, ${(profile?.siteIds || []).length} project${(profile?.siteIds || []).length === 1 ? '' : 's'}`}</span></div>
        ))}
        <nav className="snav" aria-label="Main">
          <span className="lbl">Overview</span>
          {all && <NavLink to="/" end><Icon name="dashboard" />Dashboard</NavLink>}
          <NavLink to="/sites" end><Icon name="projects" />{all ? 'Projects' : 'My projects'}</NavLink>
          {all && <><span className="lbl">On site</span>
            <NavLink to="/reports"><Icon name="reports" />Daily reports</NavLink>
            <NavLink to="/issues"><Icon name="issues" />Issues</NavLink></>}
          {((can('finance.view') && mod('budget')) || can('team.manage')) && <span className="lbl">Money and people</span>}
          {can('finance.view') && mod('budget') && <NavLink to="/finance"><Icon name="finance" />Finance</NavLink>}
          {can('team.manage') && <NavLink to="/team"><Icon name="team" />Team</NavLink>}
          {all && !!open.length && <span className="lbl">Projects</span>}
          {all && open.map((s) => (
            <NavLink key={s.id} to={`/sites/${s.id}`} className="site-link" title={late(s) ? `${s.name}: today's report is missing` : s.name}>
              <span className={`dot${late(s) ? ' late' : ''}`} aria-hidden="true" /><span>{s.name}</span>
            </NavLink>
          ))}
          {!all && (profile?.siteIds || []).map((sid) => <MySiteLink key={sid} cid={cid} sid={sid} />)}
          {can('company.settings') && <><span className="lbl">Settings</span>
            <NavLink to="/modules"><Icon name="modules" />Modules</NavLink>
            <NavLink to="/reminders"><Icon name="reminders" />Reminders</NavLink>
            <NavLink to="/company"><Icon name="company" />Company</NavLink></>}
        </nav>
        <div className="me">
          <NavLink to="/account" title="Your account">
            <span className="avatar">{initials(profile?.name)}</span>
            <span className="who-text"><b>{profile?.name}</b><span>{role ? ROLE_LABELS[role] : ''}</span></span>
          </NavLink>
        </div>
      </aside>
      {/* A crash in one page keeps the menu working; moving to another page clears it */}
      <main id="main" className="main" ref={main} tabIndex={-1}><TopBar /><ErrorBoundary key={pathname}><Outlet /></ErrorBoundary></main>
    </div>
  );
}

// Site teams see their own sites in the sidebar (they can only read the ones they're assigned to)
function MySiteLink({ cid, sid }) {
  const { data: s } = useDoc(() => cid && siteDoc(cid, sid), [cid, sid]);
  if (!s || s.status === 'closed') return null;
  return (
    <NavLink to={`/sites/${sid}`} className="site-link">
      <span className={`dot${late(s) ? ' late' : ''}`} aria-hidden="true" /><span>{s.name}</span>
    </NavLink>
  );
}
