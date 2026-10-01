import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { useOutbox } from '../lib/useOutbox';
import { outboxKey } from '../lib/reportOutbox';
import { exists, openIssuesQuery, siteRef, sitesCol, toList } from '../lib/db';
import { ALERT_LABELS, SITE_STATUS_LABELS, isSiteScoped, rankAlerts, siteAlerts, todayKey } from '@siteflow/shared';
import { Card, ErrorView, Muted, Pill, Screen, s } from '../components/ui';
import { colors } from '../theme';

export default function SitesScreen({ navigation }) {
  const { cid, profile, can, role, user } = useAuth();
  const outbox = useOutbox();
  const autoOpened = useRef(false);
  const all = can('sites.all');
  const [sites, setSites] = useState({});
  const [error, setError] = useState(null);
  const [allLoaded, setAllLoaded] = useState(false);
  const [openIssues, setOpenIssues] = useState([]);

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

  // Managers: open issues across the company feed a short "needs attention" list
  useEffect(() => {
    if (!cid || !all) return;
    return openIssuesQuery(cid).onSnapshot((q) => setOpenIssues(toList(q)), (e) => console.warn('Could not load issues', e));
  }, [cid, all]);

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
      {all && loaded ? <Attention sites={list} openIssues={openIssues} navigation={navigation} /> : null}
      {!loaded && !error ? <Muted>Loading sites…</Muted> : !list.length ? (
        <Card style={{ padding: 16 }}><Text style={{ color: colors.ink }}>You haven't been added to a site yet. Ask your manager to add you.</Text></Card>
      ) : (
        <Card>
          {list.map((site, i) => {
            const onPhone = outbox.find((x) => x.id === outboxKey(site.id, user.uid) && x.status !== 'sent');
            const sent = site.lastReportDate === today;
            return (
              <Pressable key={site.id} onPress={() => navigation.navigate('Site', { sid: site.id, name: site.name })}
                style={[s.row, i === 0 && { borderTopWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', fontSize: 16, color: colors.ink }}>{site.name}</Text>
                  <Muted>{site.location}</Muted>
                </View>
                {onPhone
                  ? <Pill kind={onPhone.status === 'failed' ? 'bad' : 'warn'}>{onPhone.status === 'failed' ? 'Report not sent' : 'Report on phone'}</Pill>
                  : site.status === 'on_hold'
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

// Top things to act on across sites (managers): critical issues, missing reports, delays
function Attention({ sites, openIssues, navigation }) {
  const alerts = rankAlerts(sites.flatMap((site) => siteAlerts(site, [], {}, { openIssues: openIssues.filter((i) => i.siteId === site.id) }).map((a) => ({ ...a, site }))));
  if (!alerts.length) return <Card style={{ padding: 14, marginBottom: 12 }}><Text style={{ color: colors.ok, fontWeight: '600' }}>Nothing needs your attention right now.</Text></Card>;
  const top = alerts.slice(0, 5);
  return (
    <>
      <Text style={{ fontWeight: '700', color: colors.ink, fontSize: 16, marginBottom: 6 }}>Needs your attention ({alerts.length})</Text>
      <Card style={{ marginBottom: 14 }}>
        {top.map((a, i) => (
          <Pressable key={`${a.site.id}-${a.kind}-${i}`} onPress={() => navigation.navigate('Site', { sid: a.site.id, name: a.site.name })} accessibilityRole="button"
            style={[s.row, i === 0 && { borderTopWidth: 0 }, a.severity === 'bad' && { borderLeftWidth: 4, borderLeftColor: colors.bad }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{a.title}</Text>
              <Muted>{a.site.name} · {ALERT_LABELS[a.kind] || a.kind}</Muted>
            </View>
          </Pressable>
        ))}
      </Card>
      {alerts.length > top.length ? <Muted style={{ marginTop: -8, marginBottom: 12 }}>{alerts.length - top.length} more on the web dashboard.</Muted> : null}
    </>
  );
}
