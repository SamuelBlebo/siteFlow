import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { exists, siteRef, sitesCol, toList } from '../lib/db';
import { todayKey } from '@siteflow/shared';
import { Button, Card, Muted, Pill, Screen, s } from '../components/ui';
import { colors } from '../theme';

export default function SitesScreen({ navigation }) {
  const { cid, profile, isAdmin, signOut } = useAuth();
  const [sites, setSites] = useState({});

  useEffect(() => {
    navigation.setOptions({ headerRight: () => <Text onPress={signOut} style={{ color: '#fff', fontWeight: '600' }}>Sign out</Text> });
  }, [navigation, signOut]);

  useEffect(() => {
    if (!cid) return;
    if (isAdmin) {
      return sitesCol(cid).onSnapshot((snap) => setSites(Object.fromEntries(toList(snap).map((x) => [x.id, x]))));
    }
    // Site team: read each assigned site directly
    const unsubs = (profile.siteIds || []).map((sid) =>
      siteRef(cid, sid).onSnapshot((d) => setSites((p) => ({ ...p, [sid]: exists(d) ? { id: d.id, ...d.data() } : null }))));
    return () => unsubs.forEach((u) => u());
  }, [cid, isAdmin, profile.siteIds?.join(',')]);

  const list = Object.values(sites).filter((x) => x && x.status !== 'closed');
  const today = todayKey();

  return (
    <Screen>
      <Muted style={{ marginBottom: 12 }}>Hi {profile.name?.split(' ')[0]}. Pick a site to work on.</Muted>
      {!list.length ? (
        <Card style={{ padding: 16 }}><Text style={{ color: colors.ink }}>You haven't been added to a site yet. Ask your manager to add you.</Text></Card>
      ) : (
        <Card>
          {list.map((site, i) => {
            const sent = site.lastReportDate === today;
            return (
              <Pressable key={site.id} onPress={() => navigation.navigate('Site', { sid: site.id, name: site.name })}
                style={[s.row, i === 0 && { borderTopWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', fontSize: 16, color: colors.ink }}>{site.name}</Text>
                  <Muted>{site.location}</Muted>
                </View>
                <Pill kind={sent ? 'ok' : 'bad'}>{sent ? 'Report sent' : 'Report due'}</Pill>
              </Pressable>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
