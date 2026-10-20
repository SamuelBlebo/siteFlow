import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { REVIEW_ITEMS, ROLE_LABELS, prettyDate } from '@siteflow/shared';
import { sub, toList } from '../lib/db';
import { colors } from '../theme';

// Requests from a manager waiting for my report on this site
export default function MyRequests({ cid, sid, uid }) {
  const [open, setOpen] = useState([]);
  useEffect(() => {
    if (!cid || !sid || !uid) return undefined;
    return sub(cid, sid, 'reportRequests').where('to', '==', uid).where('status', '==', 'open')
      .onSnapshot((s) => setOpen(toList(s)), (e) => console.warn('Could not load report requests', e));
  }, [cid, sid, uid]);
  if (!open.length) return null;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: colors.warnbg, borderRadius: 10, padding: 12, marginBottom: 12 }}>
      {open.map((r) => (
        <Text key={r.id} style={{ color: colors.ink, marginBottom: 4 }}>
          <Text style={{ fontWeight: '700' }}>{r.byName} ({ROLE_LABELS[r.byRole]})</Text> asked for your daily report for {prettyDate(r.due)}{r.note ? `: “${r.note}”` : '.'}
        </Text>
      ))}
    </View>
  );
}

// My reports on this site that a manager sent back for changes, with a way to update each
export function MyChangeRequests({ cid, sid, uid, onUpdate }) {
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!cid || !sid || !uid) return undefined;
    return sub(cid, sid, 'reports').where('createdBy', '==', uid).where('review.status', '==', 'changes_requested')
      .onSnapshot((s) => setList(toList(s)), (e) => console.warn('Could not load change requests', e));
  }, [cid, sid, uid]);
  if (!list.length) return null;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: colors.warnbg, borderRadius: 10, padding: 12, marginBottom: 12 }}>
      {list.map((r) => (
        <View key={r.id} style={{ marginBottom: 6 }}>
          <Text style={{ color: colors.ink }}>
            <Text style={{ fontWeight: '700' }}>{r.review.byName} ({ROLE_LABELS[r.review.byRole] || r.review.byRole})</Text> asked you to update your report for {prettyDate(r.date)}: {r.review.items.filter((i) => i !== 'other').map((i) => REVIEW_ITEMS[i].toLowerCase()).join(', ')}{r.review.note ? ` “${r.review.note}”` : ''}.
          </Text>
          <Pressable onPress={() => onUpdate(r)} accessibilityRole="button" style={{ alignSelf: 'flex-start', marginTop: 6, backgroundColor: colors.brass, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ color: colors.brassInk, fontWeight: '700' }}>Update report</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
