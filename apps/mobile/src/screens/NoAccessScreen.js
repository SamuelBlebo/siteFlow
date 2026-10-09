import { useAuth } from '../auth/AuthProvider';
import { Button, ErrorView, H1, Muted, Screen } from '../components/ui';

// Signed in but can't use the app: no profile, switched off, or the profile couldn't load
export default function NoAccessScreen() {
  const { signOut, profile, error, companies, switchCompany } = useAuth();
  const off = profile && profile.active === false;
  return (
    <Screen>
      <H1>{error ? 'Could not load your account' : off ? 'Access switched off' : 'Account not set up'}</H1>
      {error ? <ErrorView error={error} what="your account" /> : null}
      <Muted style={{ marginBottom: 20 }}>
        {off
          ? 'Your access to this company has been switched off. Ask your manager.'
          : "This login isn't linked to a company yet. Ask your manager to add you from the SiteFlow team page."}
      </Muted>
      {off && companies.length > 1 ? companies.filter((c) => c.id !== profile.companyId).map((c) => (
        <Button key={c.id} title={`Go to ${c.name}`} onPress={() => switchCompany(c.id)} style={{ marginBottom: 10 }} />
      )) : null}
      <Button title="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
