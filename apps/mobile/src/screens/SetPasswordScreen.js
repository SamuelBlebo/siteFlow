import { useAuth } from '../auth/AuthProvider';
import { Button, H1, Muted, Screen } from '../components/ui';
import PasswordForm from '../components/PasswordForm';

// First sign-in with a temporary password: choose your own before using SiteFlow
export default function SetPasswordScreen() {
  const { profile, signOut } = useAuth();
  return (
    <Screen>
      <H1>Choose your password</H1>
      <Muted style={{ marginBottom: 16 }}>
        Welcome, {profile?.name?.split(' ')[0]}. You signed in with a temporary password. Choose your own to continue.
      </Muted>
      <PasswordForm currentLabel="Temporary password" submitLabel="Save and continue" />
      <Button title="Sign out" variant="ghost" onPress={signOut} style={{ marginTop: 12 }} />
    </Screen>
  );
}
