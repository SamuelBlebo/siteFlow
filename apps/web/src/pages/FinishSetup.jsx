import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { useTitle } from '../lib/hooks';
import Brand from '../components/Brand';
import AuthFrame from '../components/AuthFrame';
import CompanySetupForm from '../components/CompanySetupForm';

// Shown when someone is signed in but has no profile: a sign-up that didn't finish,
// or a login that was never added to a company.
export default function FinishSetup() {
  useTitle('Set up your company');
  const { user } = useAuth();
  // The profile listener picks up the new profile and the app opens
  return (
    <AuthFrame>
      <Brand big />
      <CompanySetupForm name={user?.displayName || ''} idPrefix="fs"
        footer={<p className="row-between"><span /><button type="button" className="linkbtn" onClick={() => signOut(auth)}>Sign out</button></p>}>
        <h1>Finish setting up</h1>
        <p className="muted">Signed in as {user?.email}. If your company already uses SiteFlow, ask your manager to add you instead, then sign out.</p>
      </CompanySetupForm>
    </AuthFrame>
  );
}
