import { Navigate, Route, Routes } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';
import { useAuth } from './auth/AuthProvider';
import Layout from './components/Layout';
import Toaster from './components/Toaster';
import { ErrorState, Loading } from './components/States';
import Login from './pages/Login';
import Signup from './pages/Signup';
import FinishSetup from './pages/FinishSetup';
import SetPassword from './pages/SetPassword';
import Account from './pages/Account';
import Company from './pages/Company';
import Dashboard from './pages/Dashboard';
import NewSite from './pages/NewSite';
import Sites from './pages/Sites';
import SiteDetail from './pages/SiteDetail';
import Team from './pages/Team';
import MySites from './pages/MySites';
import SiteWorkspace from './pages/SiteWorkspace';

// Signed in, with an active profile, and (optionally) a permission.
// Hiding a page is only convenience: the security rules enforce the same permissions.
function Guard({ perm, children }) {
  const { user, profile, loading, error, active, can } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (error) return <section className="wrap narrow"><ErrorState error={error} what="your account" onRetry={() => window.location.reload()} /></section>;
  if (!profile) return <FinishSetup />;
  if (!active) {
    return (
      <section className="wrap narrow">
        <h1>Account switched off</h1>
        <p className="muted" style={{ margin: '12px 0' }}>Your access to SiteFlow has been switched off. Ask your company's owner or admin.</p>
        <button className="btn ghost" onClick={() => signOut(auth)}>Sign out</button>
      </section>
    );
  }
  if (profile.mustChangePassword) return <SetPassword />;
  if (perm && !can(perm)) return <Navigate to="/work" replace />;
  return children;
}

function Home() {
  const { can } = useAuth();
  return can('sites.all') ? <Dashboard /> : <Navigate to="/work" replace />;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route element={<Guard><Layout /></Guard>}>
          <Route index element={<Home />} />
          <Route path="sites" element={<Guard perm="sites.all"><Sites /></Guard>} />
          <Route path="sites/new" element={<Guard perm="sites.manage"><NewSite /></Guard>} />
          <Route path="sites/:sid" element={<Guard perm="sites.all"><SiteDetail /></Guard>} />
          <Route path="team" element={<Guard perm="team.manage"><Team /></Guard>} />
          <Route path="company" element={<Guard perm="company.settings"><Company /></Guard>} />
          <Route path="account" element={<Account />} />
          <Route path="work" element={<MySites />} />
          <Route path="work/:sid" element={<SiteWorkspace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
