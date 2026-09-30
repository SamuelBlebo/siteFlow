import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import auth from '@react-native-firebase/auth';
import { Button, ErrorText, Field, Screen } from '../components/ui';
import { colors } from '../theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn() {
    if (!email.trim() || !password) return setErr('Enter your email and password.');
    setBusy(true); setErr('');
    try { await auth().signInWithEmailAndPassword(email.trim(), password); }
    catch { setErr('Email or password is wrong. Check them and try again.'); setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ marginTop: 80, marginBottom: 32, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 28, height: 28, borderRadius: 4, backgroundColor: colors.tape, borderWidth: 4, borderColor: colors.ink }} />
          <Text style={{ fontSize: 30, fontWeight: '800', color: colors.ink }}>SiteFlow</Text>
        </View>
        <ErrorText>{err}</ErrorText>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
        <Button title={busy ? 'Signing in…' : 'Sign in'} onPress={signIn} disabled={busy} />
        <Text style={{ color: colors.muted, marginTop: 16 }}>Your manager sends you your login details on WhatsApp.</Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}
