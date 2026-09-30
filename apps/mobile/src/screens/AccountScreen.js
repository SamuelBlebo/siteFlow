import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, profileInput, validate } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { companyRef, exists } from '../lib/db';
import { updateMyProfile } from '../lib/account';
import { Button, Card, ErrorText, Field, H2, Muted, Notice, Screen, s } from '../components/ui';
import PasswordForm from '../components/PasswordForm';
import { colors } from '../theme';

export default function AccountScreen() {
  const { user, profile, role, cid, signOut } = useAuth();
  const [company, setCompany] = useState(null);
  const [name, setName] = useState(profile?.name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [msg, setMsg] = useState({ kind: '', text: '' });

  useEffect(() => {
    if (!cid) return;
    return companyRef(cid).onSnapshot(
      (d) => setCompany(exists(d) ? d.data() : null),
      (e) => console.warn('Could not load company', e),
    );
  }, [cid]);

  function save() {
    const v = validate(profileInput, { name, phone });
    if (!v.ok) return setMsg({ kind: 'err', text: v.error });
    updateMyProfile(user.uid, v.data);
    setName(v.data.name); setPhone(v.data.phone);
    setMsg({ kind: 'ok', text: 'Your details are saved.' });
  }

  const confirmSignOut = () => Alert.alert('Sign out?', 'You will need your email and password to sign in again.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: signOut },
  ]);

  const row = (label, value, first) => (
    <View style={[s.row, first && { borderTopWidth: 0 }]}>
      <Text style={{ color: colors.muted, width: 90 }}>{label}</Text>
      <Text style={{ color: colors.ink, flex: 1, fontWeight: '600' }}>{value}</Text>
    </View>
  );

  return (
    <Screen>
      <Card>
        {row('Company', company?.name || '–', true)}
        {row('Role', ROLE_LABELS[role] || '–')}
        {row('Email', user?.email || '–')}
      </Card>
      <Muted style={{ marginTop: 8 }}>{ROLE_DESCRIPTIONS[role]} Your manager sets your role.</Muted>

      <H2>Your details</H2>
      {msg.kind === 'err' ? <ErrorText>{msg.text}</ErrorText> : msg.text ? <Notice>{msg.text}</Notice> : null}
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="WhatsApp number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="024 000 0000" hint="Used for SiteFlow alerts on WhatsApp." />
      <Button title="Save details" onPress={save} />

      <H2>Password</H2>
      <PasswordForm />

      <H2>Sign out</H2>
      <Button title="Sign out of SiteFlow" variant="ghost" onPress={confirmSignOut} />
    </Screen>
  );
}
