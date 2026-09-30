import { NavLink, Outlet } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { ROLE_LABELS } from '@siteflow/shared';

export default function Layout() {
  const { profile, role, can } = useAuth();
  return (
    <>
      <header className="bar">
        <div className="bar-in">
          <div className="brand"><i aria-hidden="true" />SiteFlow</div>
          <nav className="nav">
            {can('sites.all') && <NavLink to="/" end>Dashboard</NavLink>}
            {can('sites.all') && <NavLink to="/sites">Sites</NavLink>}
            <NavLink to="/work">Site work</NavLink>
            {can('team.manage') && <NavLink to="/team">Team</NavLink>}
            {can('company.settings') && <NavLink to="/company">Company</NavLink>}
          </nav>
          <div className="who">
            <NavLink to="/account" className="muted" title="Your account">{profile?.name}{role ? `, ${ROLE_LABELS[role]}` : ''}</NavLink>
            <button className="btn sm ghost" onClick={() => signOut(auth)}>Sign out</button>
          </div>
        </div>
      </header>
      <main><Outlet /></main>
    </>
  );
}
