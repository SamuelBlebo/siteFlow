import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { exists, siteRef, sitesCol, toList } from '../lib/db';
import { SITE_STATUS_LABELS, isSiteScoped, todayKey } from '@siteflow/shared';
import { Card, ErrorView, Muted, Pill, Screen, s } from '../components/ui';
import { colors } from '../theme';

export default function SitesScreen({ navigation }) {
  const { cid, profile, can, role } = useAuth();
  const autoOpened = useRef(false);
  const all = can('sites.all');
  const [sites, setSites] = useState({});
  const [error, setError] = useState(null);
  const [allLoaded, setAllLoaded] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Text onPress={() => navigation.navigate('Account')} accessibilityRole="button" style={{ color: '#fff', fontWeight: '600', padding: 8 }}>Account</Text>
      ),
    });
  }, [navigation]);

  useEffect(() => {
    if (!cid) return;
    const fail = (e) => { console.warn('Could not load sites', e); setError(e); };
    setSites({}); setError(null); setAllLoaded(false);
    if (all) {
      return sitesCol(cid).onSnapshot((snap) => { setSites(Object.fromEntries(toList(snap).map((x) => [x.id, x]))); setAllLoaded(true); }, fail);
    }
    // Site-scoped roles read each assigned site directly
    const unsubs = (profile.siteIds || []).map((sid) =>
      siteRef(cid, sid).onSnapshot((d) => setSites((p) => ({ ...p, [sid]: exists(d) ? { id: d.id, ...d.data() } : null })), fail));
    return () => unsubs.forEach((u) => u());
  }, [cid, all, profile.siteIds?.join(',')]);

  const list = Object.values(sites).filter((x) => x && x.status !== 'closed').sort((a, b) => a.name.localeCompare(b.name));
  const loaded = all ? allLoaded : (profile.siteIds || []).every((id) => id in sites);

  // A supervisor with one site goes straight to it (once per app start); Back returns to this list
  useEffect(() => {
    if (autoOpened.current || !loaded || !isSiteScoped(role) || list.length !== 1) return;
    autoOpened.current = true;
    navigation.navigate('Site', { sid: list[0].id, name: list[0].name });
  }, [loaded, list.length, role]);
  const today = todayKey();

  return (
    <Screen>
      <Muted style={{ marginBottom: 12 }}>Hi {profile.name?.split(' ')[0]}. Pick a site to work on.</Muted>
      {error ? <ErrorView error={error} what="your sites" /> : null}
      {!loaded && !error ? <Muted>Loading sites…</Muted> : !list.length ? (
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
                {site.status === 'on_hold'
                  ? <Pill kind="warn">{SITE_STATUS_LABELS.on_hold}</Pill>
                  : <Pill kind={sent ? 'ok' : 'bad'}>{sent ? 'Report sent' : 'Report due'}</Pill>}
              </Pressable>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
