import { NavLink, Outlet } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../auth/AuthProvider';

export default function Layout() {
  const { profile, isAdmin } = useAuth();
  return (
    <>
      <header className="bar">
        <div className="bar-in">
          <div className="brand"><i aria-hidden="true" />SiteFlow</div>
          <nav className="nav">
            {isAdmin && <NavLink to="/" end>Dashboard</NavLink>}
            <NavLink to="/work">Site work</NavLink>
            {isAdmin && <NavLink to="/team">Team</NavLink>}
          </nav>
          <div className="who">
            <span className="muted">{profile?.name}</span>
            <button className="btn sm ghost" onClick={() => signOut(auth)}>Sign out</button>
          </div>
        </div>
      </header>
      <main><Outlet /></main>
    </>
  );
}
