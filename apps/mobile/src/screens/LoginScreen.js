import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import auth from '@react-native-firebase/auth';
import { friendlyError } from '@siteflow/shared';
import { resetPasswordEmail } from '../lib/account';
import { Button, ErrorText, Field, Notice, Screen } from '../components/ui';
import { colors } from '../theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);

  async function signIn() {
    if (!email.trim() || !password) return setMsg({ kind: 'err', text: 'Enter your email and password.' });
    setBusy(true); setMsg({});
    try {
      await auth().signInWithEmailAndPassword(email.trim(), password);
    } catch (e) {
      console.warn('Sign-in failed', e);
      setMsg({ kind: 'err', text: friendlyError(e, 'Email or password is wrong. Check them and try again.') });
      setBusy(false);
    }
  }

  async function forgot() {
    if (!email.trim()) return setMsg({ kind: 'err', text: 'Enter your email first, then tap "Forgot password".' });
    await resetPasswordEmail(email.trim()).catch((e) => console.warn('Reset email failed', e));
    setMsg({ kind: 'ok', text: 'If that email has an account, a reset link is on its way. No email access? Ask your manager for a new temporary password.' });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ marginTop: 80, marginBottom: 32, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.brass, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.brassInk, fontSize: 18, fontWeight: '800' }}>⌂</Text>
          </View>
          <Text style={{ fontSize: 30, fontWeight: '800', color: colors.ink }}>SiteFlow</Text>
        </View>
        {msg.kind === 'err' ? <ErrorText>{msg.text}</ErrorText> : msg.text ? <Notice>{msg.text}</Notice> : null}
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry={!show} autoComplete="password" />
        <Button title={show ? 'Hide password' : 'Show password'} variant="ghost" onPress={() => setShow(!show)} style={{ marginBottom: 12, paddingVertical: 10 }} />
        <Button title={busy ? 'Signing in…' : 'Sign in'} onPress={signIn} disabled={busy} />
        <Button title="Forgot password" variant="ghost" onPress={forgot} style={{ marginTop: 12 }} />
        <Text style={{ color: colors.muted, marginTop: 16 }}>Your manager sends you your login details on WhatsApp.</Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}
