import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useQuery } from '../lib/hooks';
import { companyDoc, siteDoc, sitesCol } from '../lib/db';
import { PLAN_LABELS, ROLE_LABELS, navItems, navSection, planFor, reportDay, settingsTabs, todayKey } from '@siteflow/shared';
import Brand from './Brand';
import ErrorBoundary from './ErrorBoundary';
import Icon from './Icons';
import TopBar, { initials } from './TopBar';
import { ViewAsBar } from './ViewAs';
import BottomNav from './BottomNav';
import { usePins } from './PinButton';
import { useProfileSkin } from '../lib/skin';
// Red dot: an active site whose daily report hasn't come in today
// How each menu item looks: its icon, and its short name on the phone's bottom bar
const MENU_LOOK = {
  home: { icon: 'dashboard', barIcon: 'home', bar: true },
  projects: { icon: 'projects', short: 'Projects', bar: true },
  activity: { icon: 'reports', short: 'Activity', bar: true },
  money: { icon: 'finance' },
  team: { icon: 'team' },
};
const late = (s) => reportDay(s, todayKey()) === 'due';
// Laptops: the sidebar can be folded to icons; the choice is kept on this device
const ICONS_KEY = 'sf.sideIcons';
const readIcons = () => { try { return localStorage.getItem(ICONS_KEY) === '1'; } catch { return false; } };
const saveIcons = (on) => { try { localStorage.setItem(ICONS_KEY, on ? '1' : '0'); } catch { /* private window: this session only */ } };
const TABLET = '(min-width: 640px) and (max-width: 1023px)';

// The app shell: a white sidebar that stays put (company, menu in groups, projects, you), and beside
// it the top bar and the page. On phones the sidebar gives way to a bottom bar of icons, like a phone app.
export default function Layout() {
  const { cid, profile, role, can, companies, switchCompany, viewAs } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const main = useRef(null);
  const side = useRef(null);
  // icons: folded on a laptop by choice. open: a tablet's icon sidebar shown in full for now.
  const [icons, setIcons] = useState(readIcons);
  const [open, setOpen] = useState(false);
  const tablet = () => window.matchMedia?.(TABLET).matches;
  const fold = () => {
    if (tablet()) return setOpen(!open);
    setIcons(!icons);
    saveIcons(!icons);
  };
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!side.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const all = can('sites.all');
  const { data: company } = useDoc(() => cid && companyDoc(cid), [cid]);
  const { data: sites } = useQuery(() => all && cid && sitesCol(cid), [cid, all]);
  const pinned = usePins();
  const open = sites.filter((s) => s.status !== 'closed').sort((a, b) => (pinned(b.id) - pinned(a.id)) || a.name.localeCompare(b.name));
  useProfileSkin(profile?.skin);

  // A new page starts at the top, and screen readers start reading it from its heading
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [pathname]);

  // The menu (shared navItems), used by the sidebar and (on phones) the bottom bar. bar: one of the
  // bottom bar's icons. Settings is one link at the bottom; its page has tabs for the rest.
  const nav = { role, company };
  const items = navItems(nav).map((i) => ({ ...i, ...MENU_LOOK[i.key] }));
  const settings = settingsTabs(nav).length ? { key: 'settings', to: '/company', label: 'Settings', icon: 'modules' } : null;
  // Lit for every page the item covers, detail pages included (a report, an issue, a Settings tab)
  const lit = (key) => () => (navSection(pathname) === key ? 'active' : '');
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
    <div className={`shell${icons ? ' side-icons' : ''}${open ? ' side-open' : ''}`}>
      <a className="skip" href="#main">Skip to content</a>
      <aside className="side" ref={side}>
        <div className="side-top">
          <Brand />
          {/* Laptop: fold to icons (remembered). Tablet: the icons open out over the page for now. */}
          <button type="button" className="side-fold" onClick={fold} aria-expanded={tablet() ? open : !icons}
            aria-label={(tablet() ? !open : icons) ? 'Show the menu names' : 'Fold the menu'} title={(tablet() ? !open : icons) ? 'Show the menu names' : 'Fold the menu'}>
            <Icon name="sidebar" />
          </button>
        </div>
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
          {items.map((i) => <NavLink key={i.key} to={i.to} className={lit(i.key)} title={i.label}><Icon name={i.icon} /><span className="snav-t">{i.label}</span></NavLink>)}
          {(all ? !!open.length : !!(profile?.siteIds || []).length) && <span className="lbl">Projects</span>}
          {projectLinks}
          {settings && <NavLink to={settings.to} className={lit('settings')} title={settings.label}><Icon name={settings.icon} /><span className="snav-t">{settings.label}</span></NavLink>}
        </nav>
        <div className="me">
          <NavLink to="/account" title="Your account">
            <span className="avatar">{initials(profile?.name)}</span>
            <span className="who-text"><b>{profile?.name}</b><span>{role ? ROLE_LABELS[role] : ''}</span></span>
          </NavLink>
        </div>
      </aside>
      {/* A crash in one page keeps the menu working; moving to another page clears it */}
      <main id="main" className={`main${viewAs ? ' previewing' : ''}`} ref={main} tabIndex={-1}><ViewAsBar /><TopBar /><ErrorBoundary key={pathname}><Outlet /></ErrorBoundary></main>
      <BottomNav items={settings ? [...items, settings] : items} lit={lit} projects={projectLinks} companyPick={companyPick} siteIds={all ? null : profile?.siteIds || []} />
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
