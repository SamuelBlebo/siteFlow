import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { ZONE_LABELS, overviewDrawing, todayKey, zoneState, zoneSummary } from '@siteflow/shared';
import { milestonesQuery, sub, toList } from '../lib/db';
import { colors } from '../theme';
import { Muted } from './ui';

// The project drawing on the phone (read-only): areas coloured by their programme stage, open
// issues pinned where they are. Managers upload drawings and mark areas on the web.

const ZONE_COLOURS = { done: '#1E7A55', progress: '#B98D45', behind: '#B3372B', todo: '#6B7C88', none: '#0F1D27' };
const PIN_COLOURS = { critical: '#B3372B', high: '#B3372B', medium: '#B07A12', low: '#5F6D77' };
const pc = (n) => `${n * 100}%`;

// Live drawings, stages and pinned open issues for a site
export function useSiteDrawing(cid, sid, chosen) {
  const [drawings, setDrawings] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [issues, setIssues] = useState([]);
  useEffect(() => {
    if (!cid || !sid) return undefined;
    const off = [
      sub(cid, sid, 'drawings').onSnapshot((s) => setDrawings(toList(s)), () => setDrawings([])),
      milestonesQuery(cid, sid).onSnapshot((s) => setMilestones(toList(s)), () => {}),
      sub(cid, sid, 'issues').where('status', 'in', ['open', 'in_progress']).onSnapshot((s) => setIssues(toList(s)), () => {}),
    ];
    return () => off.forEach((u) => u());
  }, [cid, sid]);
  const drawing = drawings ? overviewDrawing(drawings, chosen) : undefined;
  const pins = drawing ? issues.filter((i) => i.pin?.drawingId === drawing.id) : [];
  return { loading: drawings === null, drawing, milestones, pins };
}

// The sheet with its areas and pins. width: how wide to draw it (zoom = wider than the screen).
export function DrawingSheet({ drawing, milestones, pins, width, onPin, labels = true }) {
  const today = todayKey();
  return (
    <View style={{ width, aspectRatio: drawing.width / drawing.height, backgroundColor: '#fff' }}>
      <Image source={{ uri: drawing.image }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="contain"
        accessibilityLabel={`Drawing: ${[drawing.sheet, drawing.title].filter(Boolean).join(', ')}`} />
      {(drawing.zones || []).map((z) => {
        const st = zoneState(z, milestones, today);
        const c = ZONE_COLOURS[st.state];
        return (
          <View key={z.id} pointerEvents="none" style={{ position: 'absolute', left: pc(z.x), top: pc(z.y), width: pc(z.w), height: pc(z.h),
            borderWidth: 2, borderColor: c, borderStyle: st.state === 'none' ? 'dashed' : 'solid', backgroundColor: st.state === 'none' ? 'transparent' : `${c}2E` }}>
            {labels ? <Text numberOfLines={1} style={{ alignSelf: 'flex-start', margin: 2, backgroundColor: c, color: '#fff', fontSize: 10, fontWeight: '600', paddingHorizontal: 4, borderRadius: 3 }}>
              {z.name}{st.pct != null ? ` ${st.pct}%` : ''}</Text> : null}
          </View>
        );
      })}
      {pins.map((i, n) => (
        <Pressable key={i.id} onPress={() => onPin?.(i)} accessibilityRole="button" accessibilityLabel={`Issue ${n + 1}: ${i.title}`} hitSlop={12}
          style={{ position: 'absolute', left: pc(i.pin.x), top: pc(i.pin.y), marginLeft: -12, marginTop: -12, width: 24, height: 24, borderRadius: 12,
            backgroundColor: PIN_COLOURS[i.priority] || PIN_COLOURS.high, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{n + 1}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function DrawingKey({ drawing, milestones, pins }) {
  const sum = zoneSummary(drawing.zones || [], milestones, todayKey());
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
      {['done', 'progress', 'behind', 'todo'].map((k) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 12, height: 12, borderRadius: 2, borderWidth: 2, borderColor: ZONE_COLOURS[k], backgroundColor: `${ZONE_COLOURS[k]}40` }} />
          <Text style={{ fontSize: 12, color: colors.muted }}>{ZONE_LABELS[k]} <Text style={{ color: colors.ink, fontWeight: '600' }}>{sum[k]}</Text></Text>
        </View>
      ))}
      <Text style={{ fontSize: 12, color: colors.muted }}>Open issues <Text style={{ color: colors.ink, fontWeight: '600' }}>{pins.length}</Text></Text>
    </View>
  );
}

// Today screen card: the overview drawing; tap to open it full size
export default function SiteDrawingCard({ cid, sid, site, onOpen }) {
  const { width } = useWindowDimensions();
  const { loading, drawing, milestones, pins } = useSiteDrawing(cid, sid, site.overviewDrawingId);
  if (loading || !drawing) return null;
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open the project drawing"
      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10, marginTop: 12, marginBottom: 8 }}>
      <Text style={{ fontWeight: '600', fontSize: 16, color: colors.ink, marginBottom: 6 }}>Project drawing</Text>
      <View style={{ borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
        <DrawingSheet drawing={drawing} milestones={milestones} pins={pins} width={width - 54} labels={false} />
      </View>
      <DrawingKey drawing={drawing} milestones={milestones} pins={pins} />
      <Muted style={{ marginTop: 6 }}>{[drawing.sheet, drawing.title].filter(Boolean).join(' · ')}. Tap to open and zoom.</Muted>
    </Pressable>
  );
}

// Full screen: zoom with the buttons, scroll in both directions
export function DrawingScreen({ route, navigation }) {
  const { cid, sid, overviewDrawingId } = route.params;
  const { width } = useWindowDimensions();
  const [zoom, setZoom] = useState(1.5);
  const { loading, drawing, milestones, pins } = useSiteDrawing(cid, sid, overviewDrawingId);
  if (loading) return <View style={{ flex: 1, padding: 16 }}><Muted>Loading the drawing…</Muted></View>;
  if (!drawing) return <View style={{ flex: 1, padding: 16 }}><Muted>No drawing for this site yet.</Muted></View>;
  const zoomBtn = (label, to, a11y) => (
    <Pressable onPress={() => setZoom(to)} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={8}
      style={{ minWidth: 44, height: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '600', color: colors.ink }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 }}>
        {zoomBtn('−', Math.max(1, zoom - 0.5), 'Zoom out')}
        <Text style={{ minWidth: 48, textAlign: 'center', color: colors.muted }}>{Math.round(zoom * 100)}%</Text>
        {zoomBtn('+', Math.min(4, zoom + 0.5), 'Zoom in')}
        <Text numberOfLines={1} style={{ flex: 1, color: colors.ink, fontWeight: '600', marginLeft: 6 }}>{[drawing.sheet, drawing.title].filter(Boolean).join(' · ')}</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        <ScrollView horizontal>
          <DrawingSheet drawing={drawing} milestones={milestones} pins={pins} width={width * zoom}
            onPin={(i) => navigation.navigate('Issue', { sid, id: i.id, name: i.title })} />
        </ScrollView>
      </ScrollView>
      <View style={{ padding: 10 }}><DrawingKey drawing={drawing} milestones={milestones} pins={pins} /></View>
    </View>
  );
}
