import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { errorCode, friendlyError } from '@siteflow/shared';
import { colors } from '../theme';
import { dismiss, getSyncState, retry, subscribe } from '../lib/sync';
import { discardFailedPhotos, retryFailedPhotos, subscribePhotos } from '../lib/uploadQueue';

export function Screen({ children }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      <SyncBanner />
      {children}
    </ScrollView>
  );
}

// Offline, syncing and failed saves. Failed saves keep their data and can be retried.
export function SyncBanner() {
  const [st, setSt] = useState(getSyncState());
  const [photos, setPhotos] = useState({ waiting: 0, failed: 0 });
  useEffect(() => subscribe(setSt), []);
  useEffect(() => subscribePhotos(setPhotos), []);
  const waiting = st.pending + photos.waiting;
  return (
    <>
      {!st.online && (
        <View style={[s.banner, { backgroundColor: colors.warnbg }]} accessibilityRole="alert">
          <Text style={{ color: colors.warn, fontWeight: '600' }}>
            Offline. {waiting ? `${waiting} change${waiting === 1 ? '' : 's'} saved on this phone, waiting for signal.` : 'You can keep working; changes sync when signal returns.'}
          </Text>
        </View>
      )}
      {st.online && waiting > 0 && (
        <View style={[s.banner, { backgroundColor: colors.sunk }]}>
          <Text style={{ color: colors.ink }}>Syncing {waiting} change{waiting === 1 ? '' : 's'}…</Text>
        </View>
      )}
      {st.failed.map((f) => (
        <View key={f.id} style={[s.banner, { backgroundColor: colors.badbg }]} accessibilityRole="alert">
          <Text style={{ color: colors.bad, fontWeight: '600' }}>{f.label} was not saved.</Text>
          <Text style={{ color: colors.bad, marginTop: 2 }}>{f.message}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Button title="Try again" onPress={() => retry(f.id)} style={{ flex: 1, paddingVertical: 10 }} />
            <Button title="Dismiss" variant="ghost" onPress={() => dismiss(f.id)} style={{ flex: 1, paddingVertical: 10 }} />
          </View>
        </View>
      ))}
      {photos.failed > 0 && (
        <View style={[s.banner, { backgroundColor: colors.badbg }]} accessibilityRole="alert">
          <Text style={{ color: colors.bad, fontWeight: '600' }}>{photos.failed} photo{photos.failed === 1 ? '' : 's'} could not upload.</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Button title="Try again" onPress={retryFailedPhotos} style={{ flex: 1, paddingVertical: 10 }} />
            <Button title="Remove" variant="ghost" onPress={discardFailedPhotos} style={{ flex: 1, paddingVertical: 10 }} />
          </View>
        </View>
      )}
    </>
  );
}

export function ErrorView({ error, what = 'this' }) {
  const denied = errorCode(error) === 'permission-denied';
  return (
    <View style={[s.banner, { backgroundColor: colors.badbg }]} accessibilityRole="alert">
      <Text style={{ color: colors.bad, fontWeight: '600' }}>{denied ? `You don't have access to ${what}.` : `Could not load ${what}.`}</Text>
      <Text style={{ color: colors.bad, marginTop: 2 }}>{denied ? 'Ask your manager if you think you should.' : friendlyError(error)}</Text>
    </View>
  );
}
export const H1 = ({ children, style }) => <Text style={[s.h1, style]}>{children}</Text>;
export const H2 = ({ children, style }) => <Text style={[s.h2, style]}>{children}</Text>;
export const Muted = ({ children, style }) => <Text style={[s.muted, style]}>{children}</Text>;

export function Button({ title, onPress, variant = 'solid', disabled, style }) {
  const ghost = variant === 'ghost';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
      style={({ pressed }) => [s.btn, ghost && s.btnGhost, (pressed || disabled) && { opacity: 0.6 }, style]}>
      <Text style={[s.btnText, ghost && { color: colors.steel }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, style, ...props }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={[s.input, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, style]} {...props} />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

// Horizontal chips: a simple, thumb-friendly picker
export function Choice({ label, options, value, onChange }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value;
          const l = typeof o === 'string' ? o : o.label;
          const on = v === value;
          return (
            <Pressable key={v} onPress={() => onChange(v)} accessibilityState={{ selected: on }}
              style={[s.chip, on && { backgroundColor: colors.steel, borderColor: colors.steel }]}>
              <Text style={{ color: on ? '#fff' : colors.ink, fontWeight: '500' }}>{l}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export const ErrorText = ({ children }) => (children ? <Text style={s.err} accessibilityRole="alert">{children}</Text> : null);
export const Notice = ({ children }) => <View style={s.notice}><Text style={{ color: colors.ok, fontWeight: '500' }}>{children}</Text></View>;

export function Pill({ kind = 'ok', children }) {
  const map = { ok: [colors.okbg, colors.ok], bad: [colors.badbg, colors.bad], warn: [colors.warnbg, colors.warn] };
  const [bg, fg] = map[kind];
  return <View style={[s.pill, { backgroundColor: bg }]}><Text style={{ color: fg, fontWeight: '600', fontSize: 12 }}>{children}</Text></View>;
}

export const Card = ({ children, style }) => <View style={[s.card, style]}>{children}</View>;
export const Row = ({ children, style }) => <View style={[s.row, style]}>{children}</View>;

export const s = StyleSheet.create({
  screen: { padding: 16, paddingBottom: 40 },
  h1: { fontSize: 24, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  h2: { fontSize: 18, fontWeight: '700', color: colors.ink, marginTop: 20, marginBottom: 8 },
  muted: { color: colors.muted },
  btn: { backgroundColor: colors.steel, borderRadius: 8, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.steel },
  btnGhost: { backgroundColor: 'transparent' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  label: { fontWeight: '600', color: colors.ink, marginBottom: 6 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 12, fontSize: 16, color: colors.ink },
  hint: { color: colors.muted, fontSize: 13, marginTop: 4 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8 },
  err: { backgroundColor: colors.badbg, color: colors.bad, padding: 12, borderRadius: 8, marginBottom: 12, fontWeight: '500' },
  notice: { backgroundColor: colors.okbg, padding: 12, borderRadius: 8, marginBottom: 12 },
  pill: { borderRadius: 20, paddingVertical: 3, paddingHorizontal: 9 },
  banner: { padding: 12, borderRadius: 8, marginBottom: 12 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: colors.line, gap: 12 },
});
