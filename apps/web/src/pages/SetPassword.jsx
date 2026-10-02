import { useAuth } from '../auth/AuthProvider';
import { logOut } from '../lib/account';
import PasswordForm from '../components/PasswordForm';
import { useTitle } from '../lib/hooks';

// First sign-in with a temporary password: choose your own before using SiteFlow
export default function SetPassword() {
  useTitle('Set your password');
  const { profile } = useAuth();
  return (
    <div className="auth">
      <div className="brand big"><i aria-hidden="true" />SiteFlow</div>
      <div className="card">
        <h1>Choose your password</h1>
        <p className="muted lead">
          Welcome, {profile?.name?.split(' ')[0]}. You signed in with a temporary password. Choose your own to continue.
        </p>
        <PasswordForm currentLabel="Temporary password" submitLabel="Save and continue" />
        <p className="row-between mt-sm"><span /><button type="button" className="linkbtn" onClick={logOut}>Sign out</button></p>
      </div>
    </div>
  );
}
