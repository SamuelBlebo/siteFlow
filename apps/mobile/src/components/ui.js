import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';

export function Screen({ children }) {
  return <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
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
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: colors.line, gap: 12 },
});
