import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { errorCode, friendlyError } from '@siteflow/shared';
import { colors, touchMin } from '../theme';
import { useNavigation } from '@react-navigation/native';
import { getSyncState, subscribe } from '../lib/sync';
import { useOutbox } from '../lib/useOutbox';

export function Screen({ children, banner = true }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag">
      {banner && <SyncBanner />}
      {children}
    </ScrollView>
  );
}

// True when the Sync screen exists in this navigator or a parent (it does once signed in)
function useSyncScreen() {
  const nav = useNavigation();
  return () => {
    for (let n = nav; n; n = n.getParent()) {
      if (n.getState()?.routeNames?.includes('Sync')) return n.navigate('Sync');
    }
  };
}

// One line on every screen: offline, syncing, or changes the office refused. Tapping it opens
// the Sync screen, which lists each one with Try again. Nothing shows when everything is saved.
export function SyncBanner() {
  const [st, setSt] = useState(getSyncState());
  const outbox = useOutbox();
  const openSync = useSyncScreen();
  useEffect(() => subscribe(setSt), []);
  const reportsWaiting = outbox.filter((x) => x.status === 'waiting' || x.status === 'sending').length;
  const failed = st.failed.length + outbox.filter((x) => x.status === 'failed').length;
  const waiting = st.pending + reportsWaiting;
  const plural = (n) => `${n} change${n === 1 ? '' : 's'}`;
  let banner = null;
  if (failed) {
    banner = [colors.badbg, colors.bad, `${plural(failed)} not saved.`, 'Kept on this phone. Tap to see and try again.'];
  } else if (!st.online) {
    banner = [colors.warnbg, colors.warn, 'Offline.', waiting ? `${plural(waiting)} saved on this phone, waiting for signal.` : 'You can keep working; changes sync when signal returns.'];
  } else if (waiting || st.syncing) {
    banner = [colors.sunk, colors.ink, waiting ? `Syncing ${plural(waiting)}…` : 'Checking with the office…', ''];
  }
  if (!banner) return null;
  const [bg, fg, title, line] = banner;
  return (
    <Pressable onPress={openSync} accessibilityRole="button" accessibilityLabel={`${title} ${line} Open sync details`} style={[s.banner, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontWeight: '600' }}>{title}{!st.online && failed ? ' Offline.' : ''}</Text>
      {!!line && <Text style={{ color: fg, marginTop: 2 }}>{line}</Text>}
    </Pressable>
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
// Loading, empty: the same look on every screen
export function Loading({ what = '' }) {
  return (
    <View style={s.loading} accessible accessibilityLabel={`Loading${what ? ` ${what}` : ''}`}>
      <ActivityIndicator color={colors.steel} />
      <Text style={s.muted}>Loading{what ? ` ${what}` : ''}…</Text>
    </View>
  );
}
export function Empty({ children, action }) {
  return (
    <View style={s.empty}>
      <Text style={s.muted}>{children}</Text>
      {action ? <View style={{ marginTop: 10 }}>{action}</View> : null}
    </View>
  );
}

export const H1 = ({ children, style }) => <Text accessibilityRole="header" style={[s.h1, style]}>{children}</Text>;
export const H2 = ({ children, style }) => <Text accessibilityRole="header" style={[s.h2, style]}>{children}</Text>;
export const Muted = ({ children, style }) => <Text style={[s.muted, style]}>{children}</Text>;

export function Button({ title, onPress, variant = 'solid', disabled, style, accessibilityLabel }) {
  const ghost = variant === 'ghost';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: !!disabled }} onPress={onPress} disabled={disabled}
      style={({ pressed }) => [s.btn, ghost && s.btnGhost, (pressed || disabled) && { opacity: 0.6 }, style]}>
      <Text style={[s.btnText, ghost && { color: colors.steel }]}>{title}</Text>
    </Pressable>
  );
}

// The label is also read out by screen readers when the box is focused
export function Field({ label, hint, style, ...props }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={colors.muted} accessibilityLabel={label} accessibilityHint={hint}
        style={[s.input, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, style]} {...props} />
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
            <Pressable key={v} onPress={() => onChange(v)} accessibilityRole="button" accessibilityLabel={label ? `${label}: ${l}` : l} accessibilityState={{ selected: on }}
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
  const map = { ok: [colors.okbg, colors.ok], bad: [colors.badbg, colors.bad], warn: [colors.warnbg, colors.warn], sample: [colors.brassSoft, colors.warn] };
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
  btn: { minHeight: touchMin, justifyContent: 'center', backgroundColor: colors.steel, borderRadius: 8, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.steel },
  btnGhost: { backgroundColor: 'transparent' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  label: { fontWeight: '600', color: colors.ink, marginBottom: 6 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 12, fontSize: 16, color: colors.ink },
  hint: { color: colors.muted, fontSize: 13, marginTop: 4 },
  chip: { minHeight: touchMin - 4, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8 },
  err: { backgroundColor: colors.badbg, color: colors.bad, padding: 12, borderRadius: 8, marginBottom: 12, fontWeight: '500' },
  notice: { backgroundColor: colors.okbg, padding: 12, borderRadius: 8, marginBottom: 12 },
  pill: { borderRadius: 20, paddingVertical: 3, paddingHorizontal: 9 },
  banner: { padding: 12, borderRadius: 8, marginBottom: 12 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10 },
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 32 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, borderRadius: 10, padding: 16 },
  row: { minHeight: touchMin, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: colors.line, gap: 12 },
});
