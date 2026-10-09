import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { ROLE_LABELS, prettyDate } from '@siteflow/shared';
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
