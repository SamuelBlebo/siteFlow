import { Fragment, useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useQuery } from '../lib/hooks';
import { companyDoc, siteDoc, sitesCol } from '../lib/db';
import { PLAN_LABELS, ROLE_LABELS, isOn, planFor, reportDay, todayKey } from '@siteflow/shared';
import Brand from './Brand';
import ErrorBoundary from './ErrorBoundary';
import Icon from './Icons';
import TopBar, { initials } from './TopBar';
import BottomNav from './BottomNav';
import { usePins } from './PinButton';
import { useProfileSkin } from '../lib/skin';
// Red dot: an active site whose daily report hasn't come in today
const GROUPS = ['Overview', 'On site', 'Money and people'];
const late = (s) => reportDay(s, todayKey()) === 'due';

// The app shell: a white sidebar that stays put (company, menu in groups, projects, you), and beside
// it the top bar and the page. On phones the sidebar gives way to a bottom bar of icons, like a phone app.
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

  // The menu, used by the sidebar and (on phones) the bottom bar. bar: one of the bottom bar's icons.
  const items = [
    all && { to: '/', end: true, icon: 'dashboard', label: 'Dashboard', short: 'Home', barIcon: 'home', group: 'Overview', bar: true },
    { to: '/sites', end: true, icon: 'projects', label: all ? 'Projects' : 'My projects', short: 'Projects', group: 'Overview', bar: true },
    all && { to: '/reports', icon: 'reports', label: 'Daily reports', short: 'Reports', group: 'On site', bar: true },
    all && { to: '/issues', icon: 'issues', label: 'Issues', group: 'On site', bar: true },
    can('finance.view') && mod('budget') && { to: '/finance', icon: 'finance', label: 'Finance', group: 'Money and people' },
    can('team.manage') && { to: '/team', icon: 'team', label: 'Team', group: 'Money and people' },
    ...(can('company.settings') ? [
      { to: '/modules', icon: 'modules', label: 'Modules', group: 'Settings' },
      { to: '/reminders', icon: 'reminders', label: 'Reminders', group: 'Settings' },
      { to: '/company', icon: 'company', label: 'Company', group: 'Settings' },
    ] : []),
  ].filter(Boolean);
  const settings = items.filter((i) => i.group === 'Settings');
  const projectLinks = all
    ? open.map((s) => (
      <NavLink key={s.id} to={`/sites/${s.id}`} className="site-link" title={late(s) ? `${s.name}: today's report is missing` : s.name}>
        <span className={`dot${late(s) ? ' late' : ''}`} aria-hidden="true" /><span>{s.name}</span>
      </NavLink>
    ))
    : (profile?.siteIds || []).map((sid) => <MySiteLink key={sid} cid={cid} sid={sid} />);
  const companyPick = companies.length > 1 && (
    <select id="org-pick-m" aria-label="Company" value={cid} onChange={(e) => { navigate('/'); switchCompany(e.target.value); }}>
      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );

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
          {GROUPS.map((g) => {
            const list = items.filter((i) => i.group === g);
            return list.length ? <Fragment key={g}><span className="lbl">{g}</span>{list.map((i) => <NavLink key={i.to} to={i.to} end={i.end}><Icon name={i.icon} />{i.label}</NavLink>)}</Fragment> : null;
          })}
          {(all ? !!open.length : !!(profile?.siteIds || []).length) && <span className="lbl">Projects</span>}
          {projectLinks}
          {settings.length > 0 && <><span className="lbl">Settings</span>{settings.map((i) => <NavLink key={i.to} to={i.to}><Icon name={i.icon} />{i.label}</NavLink>)}</>}
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
      <BottomNav items={items} projects={projectLinks} companyPick={companyPick} siteIds={all ? null : profile?.siteIds || []} />
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
