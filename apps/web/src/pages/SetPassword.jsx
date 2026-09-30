import { useAuth } from '../auth/AuthProvider';
import { logOut } from '../lib/account';
import PasswordForm from '../components/PasswordForm';

// First sign-in with a temporary password: choose your own before using SiteFlow
export default function SetPassword() {
  const { profile } = useAuth();
  return (
    <div className="auth">
      <div className="brand big"><i aria-hidden="true" />SiteFlow</div>
      <div className="card">
        <h1>Choose your password</h1>
        <p className="muted" style={{ margin: '8px 0 16px' }}>
          Welcome, {profile?.name?.split(' ')[0]}. You signed in with a temporary password. Choose your own to continue.
        </p>
        <PasswordForm currentLabel="Temporary password" submitLabel="Save and continue" />
        <p className="row-between" style={{ marginTop: 12 }}><span /><button type="button" className="linkbtn" onClick={logOut}>Sign out</button></p>
      </div>
    </div>
  );
}
