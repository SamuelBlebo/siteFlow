import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
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
const Terms = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Terms })));
const Privacy = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Privacy })));
const FinishSetup = lazy(() => import('./pages/FinishSetup'));
const SetPassword = lazy(() => import('./pages/SetPassword'));
const Account = lazy(() => import('./pages/Account'));
const Company = lazy(() => import('./pages/Company'));
const Modules = lazy(() => import('./pages/Modules'));
const Reminders = lazy(() => import('./pages/Reminders'));
const Welcome = lazy(() => import('./pages/Welcome'));
const PhotoCredits = lazy(() => import('./pages/PhotoCredits'));
const Landing = lazy(() => import('./pages/Landing'));
const AcceptInvite = lazy(() => import('./pages/AcceptInvite'));
const EmailSettings = lazy(() => import('./pages/EmailSettings'));
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
const Admin = lazy(() => import('./pages/Admin'));

// Signed in, with an active profile, and (optionally) a permission.
// Hiding a page is only convenience: the security rules enforce the same permissions.
function Guard({ perm, children }) {
  const { user, profile, loading, error, active, company, can } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <Loading />;
  // Visitors who are not signed in see the public front page at the home address
  if (!user) return pathname === '/' ? <Landing /> : <Navigate to="/login" replace />;
  if (error) return <section className="wrap narrow"><ErrorState error={error} what="your account" onRetry={() => window.location.reload()} /></section>;
  if (!profile) return <FinishSetup />;
  if (!active) return <NoAccess title="Access switched off">Your access to this company has been switched off. Ask its owner or admin.</NoAccess>;
  // Paused by SiteFlow: the rules refuse the company's data, so no page is opened at all
  if (company?.suspended) return <NoAccess title="Account paused">This company's account is paused. Contact SiteFlow.</NoAccess>;
  if (profile.mustChangePassword) return <SetPassword />;
  if (perm && !can(perm)) return <Navigate to="/sites" replace />;
  return children;
}

// This company can't be opened (access switched off, or the account paused). People who belong to
// other companies can go to one of those instead.
function NoAccess({ title, children }) {
  const { profile, companies, switchCompany } = useAuth();
  return (
    <section className="wrap narrow">
      <h1>{title}</h1>
      <p className="muted lead">{children}</p>
      {companies.length > 1 && (
        <div className="actions mb">{companies.filter((c) => c.id !== profile.companyId).map((c) => (
          <button key={c.id} type="button" className="btn gold" onClick={() => switchCompany(c.id)}>Go to {c.name}</button>
        ))}</div>
      )}
      <button type="button" className="btn ghost" onClick={() => signOut(auth)}>Sign out</button>
    </section>
  );
}

// The platform admin's page, outside the company shell. Everyone else is sent to the home page.
function AdminRoute() {
  const { platformAdmin } = useAuth();
  if (platformAdmin === null) return <Loading />;
  return platformAdmin ? <Admin /> : <Navigate to="/" replace />;
}

function WorkRedirect() {
  const { sid } = useParams();
  const { search } = useLocation();
  return <Navigate to={`/sites/${sid}${search}`} replace />;
}

function Home() {
  const { can } = useAuth();
  return can('sites.all') ? <Dashboard /> : <Navigate to="/sites" replace />;
}

export default function App() {
  return (
    <>
      <ErrorBoundary>
      <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/email-settings" element={<EmailSettings />} />
        <Route path="/admin" element={<AdminRoute />} />
        <Route element={<Guard><Layout /></Guard>}>
          <Route index element={<Home />} />
          <Route path="sites" element={<Sites />} />
          <Route path="reports" element={<Guard perm="sites.all"><Reports /></Guard>} />
          <Route path="reports/:sid/:rid" element={<ReportDetail />} />
          <Route path="issues" element={<Guard perm="sites.all"><Issues /></Guard>} />
          <Route path="issues/:sid/:id" element={<IssueDetail />} />
          <Route path="finance" element={<Guard perm="finance.view"><Finance /></Guard>} />
          <Route path="sites/new" element={<Guard perm="sites.manage"><NewSite /></Guard>} />
          <Route path="sites/:sid" element={<SiteDetail />} />
          <Route path="team" element={<Guard perm="team.manage"><Team /></Guard>} />
          <Route path="company" element={<Guard perm="company.settings"><Company /></Guard>} />
          <Route path="modules" element={<Guard perm="company.settings"><Modules /></Guard>} />
          <Route path="reminders" element={<Guard perm="company.settings"><Reminders /></Guard>} />
          <Route path="welcome" element={<Guard perm="company.settings"><Welcome /></Guard>} />
          <Route path="photo-credits" element={<PhotoCredits />} />
          <Route path="account" element={<Account />} />
          {/* The site workspace is now part of the project page: old links (emails, WhatsApp) still work */}
          <Route path="work" element={<Navigate to="/sites" replace />} />
          <Route path="work/:sid" element={<WorkRedirect />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
      <Toaster />
    </>
  );
}
