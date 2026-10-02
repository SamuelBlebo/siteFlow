import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { ROLE_LABELS } from '@siteflow/shared';

export default function Layout() {
  const { profile, role, can } = useAuth();
  const { pathname } = useLocation();
  const main = useRef(null);
  // A new page starts at the top, and screen readers start reading it from its heading
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="bar">
        <div className="bar-in">
          <div className="brand"><i aria-hidden="true" />SiteFlow</div>
          <nav className="nav" aria-label="Main">
            {can('sites.all') && <NavLink to="/" end>Dashboard</NavLink>}
            {can('sites.all') && <NavLink to="/sites">Sites</NavLink>}
            {can('sites.all') && <NavLink to="/reports">Reports</NavLink>}
            {can('sites.all') && <NavLink to="/issues">Issues</NavLink>}
            {can('finance.view') && <NavLink to="/finance">Finance</NavLink>}
            <NavLink to="/work">Site work</NavLink>
            {can('team.manage') && <NavLink to="/team">Team</NavLink>}
            {can('company.settings') && <NavLink to="/company">Company</NavLink>}
          </nav>
          <div className="who">
            <NavLink to="/account" className="muted" title="Your account">{profile?.name}{role ? `, ${ROLE_LABELS[role]}` : ''}</NavLink>
            <button type="button" className="btn sm ghost" onClick={() => signOut(auth)}>Sign out</button>
          </div>
        </div>
      </header>
      <main id="main" ref={main} tabIndex={-1}><Outlet /></main>
    </>
  );
}
