import { useAuth } from '../auth/AuthProvider';
import { Button, H1, Muted, Screen } from '../components/ui';

export default function NoAccessScreen() {
  const { signOut } = useAuth();
  return (
    <Screen>
      <H1>Account not set up</H1>
      <Muted style={{ marginBottom: 20 }}>This login isn't linked to a company yet. Ask your manager to add you from the SiteFlow team page.</Muted>
      <Button title="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
