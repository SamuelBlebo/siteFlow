import { Linking, Pressable, Text, View } from 'react-native';
import { useSite } from '../site/SiteContext';
import { useOutbox } from '../lib/useOutbox';
import { outboxKey } from '../lib/reportOutbox';
import { useAuth } from '../auth/AuthProvider';
import {
  MILESTONE_STATUS_LABELS, PROGRESS_STEPS, SCHEDULE_LABELS, SITE_STATUS_LABELS, longToday, materialStatus, overdueMilestones, plannedPct, prettyDate,
  scheduleStatus, todayKey, waPhone,
} from '@siteflow/shared';
import { useState } from 'react';
import { setMilestoneProgress } from '../lib/db';
import { Button, Card, Empty, ErrorView, H1, H2, Loading, Muted, Pill, Screen, s } from '../components/ui';
import { colors } from '../theme';

export default function TodayScreen({ navigation }) {
  const { profile, user } = useAuth();
  const { cid, sid, site, loading, error, materials, usage, presentCount, canWork, milestones } = useSite();
  const outbox = useOutbox();
  if (loading) return <Screen><Loading what="site" /></Screen>;
  if (!site) return <Screen>{error ? <ErrorView error={error} what="this site" /> : <Empty>This site is not available. Ask your manager if you should have access.</Empty>}</Screen>;
  const work = canWork;

  const queued = outbox.find((x) => x.id === outboxKey(sid, user.uid));
  const sent = site.lastReportDate === todayKey() || !!queued;
  const used = Object.keys(usage).length > 0;
  const steps = [
    { tab: 'Workers', done: presentCount > 0, title: 'Mark attendance', note: presentCount ? `${presentCount} workers present` : 'Tick who came to site today' },
    { tab: 'Materials', done: used, title: 'Log materials used', note: used ? 'Usage logged today' : 'Record what was used today' },
    { tab: 'Report', done: sent, title: 'Send daily report', note: queued && queued.status !== 'sent' ? (queued.status === 'failed' ? 'Not sent. Open to try again' : 'Saved on phone, sends when there is signal') : sent ? `Sent at ${site.lastReportTime || queued?.time}` : 'Progress, photos and issues' },
  ].filter((st) => work || st.tab !== 'Report');

  return (
    <Screen>
      <H1>Hello, {profile.name?.split(' ')[0]}</H1>
      <Muted style={{ marginBottom: 16 }}>{longToday()}</Muted>
      {site.status === 'closed' ? <Pill kind="bad">This site is closed. You can view it but not add anything.</Pill> : !work ? <Muted style={{ marginBottom: 12 }}>You can view this site but not change it.</Muted> : null}
      {site.status === 'on_hold' ? <Muted style={{ marginBottom: 12 }}>This site is on hold. Daily reports are not expected, but you can still send one.</Muted> : null}
      {error ? <ErrorView error={error} what="some site data" /> : null}
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
      <Progress cid={cid} sid={sid} site={site} milestones={milestones} canWork={work} />
      <H2>Site information</H2>
      <SiteInfo site={site} />
      <H2>Stock on site</H2>
      <Card>
        {!materials.length ? <Text style={{ padding: 14, color: colors.muted }}>No materials set up yet.</Text> :
          materials.map((m, i) => (
            <View key={m.id} style={[s.row, i === 0 && { borderTopWidth: 0 }]}>
              <Text style={{ flex: 1, color: colors.ink }}>{m.name}</Text>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{m.stock} <Text style={{ fontWeight: '400', color: colors.muted }}>{m.unit}</Text></Text>
              {m.stock < 0 ? <Pill kind="bad">Count needed</Pill> : materialStatus(m, usage[m.id]).low ? <Pill kind="warn">Low</Pill> : null}
            </View>
          ))}
      </Card>
    </Screen>
  );
}

function SiteInfo({ site }) {
  const planned = plannedPct(site);
  const rows = [
    ['Status', SITE_STATUS_LABELS[site.status] || site.status],
    ['Location', site.location],
    ['Stage', `${site.stage}, ${site.progress || 0}% done${planned != null ? ` (plan: ${planned}%)` : ''}`],
    ['Planned', site.planStart || site.planEnd ? `${site.planStart ? prettyDate(site.planStart) : '?'} to ${site.planEnd ? prettyDate(site.planEnd) : '?'}` : 'No dates set'],
    ['Foreman', site.foremanName || '–'],
    ['Client', site.client?.name || '–'],
  ];
  return (
    <>
      <Card>
        {rows.map(([label, value], i) => (
          <View key={label} style={[s.row, i === 0 && { borderTopWidth: 0 }]}>
            <Text style={{ color: colors.muted, width: 80 }}>{label}</Text>
            <Text style={{ color: colors.ink, flex: 1 }}>{value}</Text>
          </View>
        ))}
      </Card>
      {site.foremanPhone ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Button title="Call foreman" variant="ghost" onPress={() => Linking.openURL(`tel:${site.foremanPhone}`)} style={{ flex: 1 }} />
          <Button title="WhatsApp" variant="ghost" onPress={() => Linking.openURL(`https://wa.me/${waPhone(site.foremanPhone)}`)} style={{ flex: 1 }} />
        </View>
      ) : null}
    </>
  );
}

// Where the job stands against the plan, and quick milestone updates
function Progress({ cid, sid, site, milestones, canWork }) {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(null);
  const st = scheduleStatus(site, milestones);
  const overdue = new Set(overdueMilestones(milestones, todayKey()).map((m) => m.id));
  const color = st.state === 'behind' ? colors.bad : st.state === 'no_plan' ? colors.muted : colors.ok;
  return (
    <>
      <H2>Progress</H2>
      <Card style={{ padding: 14, marginBottom: 8 }}>
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>{st.actual}% done</Text>
        <Text style={{ color, fontWeight: '600' }}>
          {SCHEDULE_LABELS[st.state]}{st.planned != null && st.state !== 'finished' ? `: ${st.planned}% planned by today` : ''}{st.state === 'behind' && st.weeksBehind ? `, about ${st.weeksBehind} week${st.weeksBehind === 1 ? '' : 's'} behind` : ''}
        </Text>
      </Card>
      {milestones.length ? (
        <Card>
          {milestones.map((m, i) => (
            <View key={m.id} style={[s.row, i === 0 && { borderTopWidth: 0 }, { flexDirection: 'column', alignItems: 'stretch', gap: 6 }]}>
              <Pressable onPress={() => canWork && setOpen(open === m.id ? null : m.id)} accessibilityRole={canWork ? 'button' : undefined}
                accessibilityLabel={`${m.name}, ${m.percentDone}%${canWork ? '. Tap to update' : ''}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, color: colors.ink, fontWeight: '600' }}>{m.name}</Text>
                  {overdue.has(m.id) ? <Pill kind="bad">Overdue</Pill> : <Muted>{MILESTONE_STATUS_LABELS[m.status]}</Muted>}
                  <Text style={{ color: colors.ink, fontWeight: '700', width: 48, textAlign: 'right' }}>{m.percentDone}%</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.sunk, marginTop: 6 }}>
                  <View style={{ height: 6, borderRadius: 3, width: `${m.percentDone}%`, backgroundColor: m.status === 'done' ? colors.ok : colors.steel }} />
                </View>
              </Pressable>
              {open === m.id && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {PROGRESS_STEPS.map((p) => (
                    <Pressable key={p} onPress={() => { setMilestoneProgress(cid, sid, { milestone: m, all: milestones, percentDone: p, uid: user.uid, name: profile.name }); setOpen(null); }}
                      accessibilityRole="button" accessibilityState={{ selected: m.percentDone === p }}
                      style={{ flex: 1, minHeight: 44, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
                        borderColor: m.percentDone === p ? colors.steel : colors.line, backgroundColor: m.percentDone === p ? colors.steel : colors.surface }}>
                      <Text style={{ color: m.percentDone === p ? '#fff' : colors.ink, fontWeight: '600' }}>{p === 100 ? 'Done' : `${p}%`}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ))}
        </Card>
      ) : <Muted>No milestones set up. Progress comes from the daily reports.</Muted>}
      {canWork && milestones.length ? <Muted style={{ fontSize: 13, marginTop: 4 }}>Tap a milestone to update it.</Muted> : null}
    </>
  );
}
