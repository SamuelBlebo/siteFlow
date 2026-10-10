import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { REPORT_PHOTO_LIMIT, REVIEW_ITEMS, ROLE_LABELS, WEATHER, prettyDate, reportInput, validate } from '@siteflow/shared';
import { exists, reportRef } from '../lib/db';
import { updateReportOnline } from '../lib/reportOutbox';
import { Button, Choice, ErrorText, Field, Loading, Muted, Screen } from '../components/ui';
import PhotoPicker from '../components/PhotoPicker';
import { colors } from '../theme';

// Updating a report a manager sent back for changes: the report's fields filled in, plus more photos.
// Needs signal (it changes a report already at the office).
export default function ReportUpdateScreen({ route, navigation }) {
  const { cid, sid, rid } = route.params;
  const [r, setR] = useState(undefined);
  const [f, setF] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => reportRef(cid, sid, rid).onSnapshot((s) => {
    const d = exists(s) ? { id: s.id, siteId: sid, ...s.data() } : null;
    setR(d);
    if (d) setF((p) => p || { text: d.text || '', notes: d.notes || '', issues: d.issues || '', weather: d.weather || '', stage: d.stage || '', progress: String(d.progress ?? 0), workersPresent: String(d.workersPresent ?? 0) });
  }, () => setR(null)), [cid, sid, rid]);

  if (r === undefined || (r && !f)) return <Screen><Loading what="report" /></Screen>;
  if (!r) return <Screen><Muted>This report was not found.</Muted></Screen>;
  const v = r.review;
  if (v?.status !== 'changes_requested') {
    return <Screen><Muted>{v?.status === 'updated' ? 'You have updated this report. Thank you.' : 'Nobody has asked for changes to this report.'}</Muted><Button title="Back" variant="ghost" onPress={() => navigation.goBack()} style={{ marginTop: 12 }} /></Screen>;
  }
  const room = REPORT_PHOTO_LIMIT - (r.photos?.length || 0);
  const set = (k) => (val) => setF((p) => ({ ...p, [k]: val }));

  async function send() {
    const ok = validate(reportInput, f);
    if (!ok.ok) return setErr(ok.error);
    setBusy(true); setErr('');
    try {
      await updateReportOnline({ cid, report: r, input: ok.data, photoUris: photos });
      navigation.goBack();
    } catch (e) {
      setErr(e?.code === 'offline' ? 'No signal. Updating a report needs an internet connection.' : 'Could not update the report. Try again.');
    } finally { setBusy(false); }
  }

  return (
    <Screen>
      <View style={{ backgroundColor: colors.warnbg, borderRadius: 10, padding: 12, marginBottom: 14 }}>
        <Text style={{ color: colors.ink, fontWeight: '700', marginBottom: 4 }}>{v.byName} ({ROLE_LABELS[v.byRole] || v.byRole}) asked you to change:</Text>
        {v.items.filter((i) => i !== 'other').map((i) => <Text key={i} style={{ color: colors.ink }}>• {REVIEW_ITEMS[i]}</Text>)}
        {v.note ? <Text style={{ color: colors.ink, fontStyle: 'italic', marginTop: 4 }}>“{v.note}”</Text> : null}
      </View>
      <Muted style={{ marginBottom: 12 }}>Your report for {prettyDate(r.date)}, {r.siteName}</Muted>
      {err ? <ErrorText>{err}</ErrorText> : null}
      <Field label="Work done" value={f.text} onChangeText={set('text')} multiline />
      <Field label="Workers on site" value={f.workersPresent} onChangeText={set('workersPresent')} keyboardType="number-pad" />
      <Field label="Stage" value={f.stage} onChangeText={set('stage')} />
      <Field label="Progress (%)" value={f.progress} onChangeText={set('progress')} keyboardType="number-pad" />
      <Choice label="Weather" options={['', ...WEATHER].map((w) => ({ value: w, label: w || 'Not given' }))} value={f.weather} onChange={set('weather')} />
      <Field label="Issues or delays" value={f.issues} onChangeText={set('issues')} multiline placeholder="Leave empty if none" />
      <Field label="Notes" value={f.notes} onChangeText={set('notes')} multiline />
      {room > 0 ? <><Text style={{ fontWeight: '600', color: colors.ink, marginBottom: 6 }}>Add photos (up to {room} more)</Text><PhotoPicker photos={photos} onChange={setPhotos} limit={room} /></>
        : <Muted>The report already has the most photos allowed.</Muted>}
      <Button title={busy ? 'Sending…' : 'Send updated report'} onPress={send} disabled={busy} style={{ marginTop: 14 }} />
    </Screen>
  );
}
