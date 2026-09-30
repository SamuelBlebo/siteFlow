import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import Layout from './components/Layout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import NewSite from './pages/NewSite';
import SiteDetail from './pages/SiteDetail';
import Team from './pages/Team';
import MySites from './pages/MySites';
import SiteWorkspace from './pages/SiteWorkspace';

function Guard({ admin, children }) {
  const { user, profile, loading, isAdmin } = useAuth();
  if (loading) return <p className="pad">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return <p className="pad">Setting up your account…</p>;
  if (admin && !isAdmin) return <Navigate to="/work" replace />;
  return children;
}

export default function App() {
  const { isAdmin } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route element={<Guard><Layout /></Guard>}>
        <Route index element={isAdmin ? <Dashboard /> : <Navigate to="/work" replace />} />
        <Route path="sites/new" element={<Guard admin><NewSite /></Guard>} />
        <Route path="sites/:sid" element={<Guard admin><SiteDetail /></Guard>} />
        <Route path="team" element={<Guard admin><Team /></Guard>} />
        <Route path="work" element={<MySites />} />
        <Route path="work/:sid" element={<SiteWorkspace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
