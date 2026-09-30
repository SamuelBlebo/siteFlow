import { Pressable, Text, View } from 'react-native';
import { useSite } from '../site/SiteContext';
import { useAuth } from '../auth/AuthProvider';
import { longToday, todayKey } from '@siteflow/shared';
import { Card, H1, H2, Muted, Pill, Screen, s } from '../components/ui';
import { colors } from '../theme';

export default function TodayScreen({ navigation }) {
  const { profile } = useAuth();
  const { site, materials, usage, presentCount } = useSite();
  if (!site) return <Screen><Muted>Loading site…</Muted></Screen>;

  const sent = site.lastReportDate === todayKey();
  const used = Object.keys(usage).length > 0;
  const steps = [
    { tab: 'Workers', done: presentCount > 0, title: 'Mark attendance', note: presentCount ? `${presentCount} workers present` : 'Tick who came to site today' },
    { tab: 'Materials', done: used, title: 'Log materials used', note: used ? 'Usage logged today' : 'Record what was used today' },
    { tab: 'Report', done: sent, title: 'Send daily report', note: sent ? `Sent at ${site.lastReportTime}` : 'Progress, photos and issues' },
  ];

  return (
    <Screen>
      <H1>Hello, {profile.name?.split(' ')[0]}</H1>
      <Muted style={{ marginBottom: 16 }}>{longToday()}</Muted>
      {steps.map((st, i) => (
        <Pressable key={st.tab} onPress={() => navigation.navigate(st.tab)} accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 14, marginBottom: 8 }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
            backgroundColor: st.done ? colors.ok : colors.sunk, borderWidth: 1, borderColor: st.done ? colors.ok : colors.line }}>
            <Text style={{ color: st.done ? '#fff' : colors.ink, fontWeight: '700' }}>{st.done ? '✓' : i + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', fontSize: 16, color: colors.ink }}>{st.title}</Text>
            <Muted>{st.note}</Muted>
          </View>
        </Pressable>
      ))}
      <H2>Stock on site</H2>
      <Card>
        {!materials.length ? <Text style={{ padding: 14, color: colors.muted }}>No materials set up yet.</Text> :
          materials.map((m, i) => (
            <View key={m.id} style={[s.row, i === 0 && { borderTopWidth: 0 }]}>
              <Text style={{ flex: 1, color: colors.ink }}>{m.name}</Text>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{m.stock} <Text style={{ fontWeight: '400', color: colors.muted }}>{m.unit}</Text></Text>
              {m.stock < m.reorderLevel ? <Pill kind="warn">Low</Pill> : null}
            </View>
          ))}
      </Card>
    </Screen>
  );
}
