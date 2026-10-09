import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';
import { useAuth } from './auth/AuthProvider';
import Layout from './components/Layout';
import Toaster from './components/Toaster';
import ErrorBoundary from './components/ErrorBoundary';
import { ErrorState, Loading } from './components/States';

// Each page is its own download, fetched the first time it is opened
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const FinishSetup = lazy(() => import('./pages/FinishSetup'));
const SetPassword = lazy(() => import('./pages/SetPassword'));
const Account = lazy(() => import('./pages/Account'));
const Company = lazy(() => import('./pages/Company'));
const Modules = lazy(() => import('./pages/Modules'));
const Reminders = lazy(() => import('./pages/Reminders'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const NewSite = lazy(() => import('./pages/NewSite'));
const Sites = lazy(() => import('./pages/Sites'));
const Reports = lazy(() => import('./pages/Reports'));
const ReportDetail = lazy(() => import('./pages/ReportDetail'));
const Issues = lazy(() => import('./pages/Issues'));
const IssueDetail = lazy(() => import('./pages/IssueDetail'));
const Finance = lazy(() => import('./pages/Finance'));
const SiteDetail = lazy(() => import('./pages/SiteDetail'));
const Team = lazy(() => import('./pages/Team'));
const MySites = lazy(() => import('./pages/MySites'));
const SiteWorkspace = lazy(() => import('./pages/SiteWorkspace'));

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
        <p className="muted lead">Your access to SiteFlow has been switched off. Ask your company's owner or admin.</p>
        <button type="button" className="btn ghost" onClick={() => signOut(auth)}>Sign out</button>
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
      <ErrorBoundary>
      <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route element={<Guard><Layout /></Guard>}>
          <Route index element={<Home />} />
          <Route path="sites" element={<Guard perm="sites.all"><Sites /></Guard>} />
          <Route path="reports" element={<Guard perm="sites.all"><Reports /></Guard>} />
          <Route path="reports/:sid/:rid" element={<ReportDetail />} />
          <Route path="issues" element={<Guard perm="sites.all"><Issues /></Guard>} />
          <Route path="issues/:sid/:id" element={<IssueDetail />} />
          <Route path="finance" element={<Guard perm="finance.view"><Finance /></Guard>} />
          <Route path="sites/new" element={<Guard perm="sites.manage"><NewSite /></Guard>} />
          <Route path="sites/:sid" element={<Guard perm="sites.all"><SiteDetail /></Guard>} />
          <Route path="team" element={<Guard perm="team.manage"><Team /></Guard>} />
          <Route path="company" element={<Guard perm="company.settings"><Company /></Guard>} />
          <Route path="modules" element={<Guard perm="company.settings"><Modules /></Guard>} />
          <Route path="reminders" element={<Guard perm="company.settings"><Reminders /></Guard>} />
          <Route path="account" element={<Account />} />
          <Route path="work" element={<MySites />} />
          <Route path="work/:sid" element={<SiteWorkspace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
      <Toaster />
    </>
  );
}
