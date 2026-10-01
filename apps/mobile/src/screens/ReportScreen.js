import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  REPORT_PHOTO_LIMIT, STAGES, WEATHER, WORK_PHRASES, materialsUsed, prettyDate, reportId, reportInput, todayKey, validate,
} from '@siteflow/shared';
import { useSite } from '../site/SiteContext';
import { useAuth } from '../auth/AuthProvider';
import { exists, reportRef, siteReportsQuery, toList, todayLogsQuery } from '../lib/db';
import { deleteReport, outboxKey, queueReport, retryReport } from '../lib/reportOutbox';
import { useOutbox } from '../lib/useOutbox';
import { clearDraft, readDraft, writeDraft } from '../lib/drafts';
import { Button, Card, Choice, ErrorText, ErrorView, Field, H1, H2, Muted, Pill, Screen, s } from '../components/ui';
import { colors } from '../theme';

const STATUS = {
  waiting: ['warn', 'Saved on this phone. It sends as soon as there is signal.'],
  sending: ['warn', 'Sending…'],
  sent: ['ok', 'Sent. The office can see it.'],
  failed: ['bad', 'Not sent.'],
};

export default function ReportScreen() {
  const { user, profile } = useAuth();
  const { cid, sid, site, loading, error, presentCount, canWork } = useSite();
  const outbox = useOutbox();
  const [onServer, setOnServer] = useState(null);
  const [logs, setLogs] = useState([]);
  const today = todayKey();
  const draftKey = `report:${sid}:${user.uid}:${today}`;
  const queued = outbox.find((x) => x.id === outboxKey(sid, user.uid, today));

  useEffect(() => reportRef(cid, sid, reportId(today, user.uid)).onSnapshot(
    (d) => setOnServer(exists(d) ? d.data() : null), (e) => console.warn('Could not check today\'s report', e)), [cid, sid, user.uid, today]);
  useEffect(() => todayLogsQuery(cid, sid).onSnapshot((q) => setLogs(toList(q)), () => {}), [cid, sid]);

  if (loading) return <Screen><Muted>Loading…</Muted></Screen>;
  if (!site) return <Screen>{error ? <ErrorView error={error} what="this site" /> : <Muted>This site is not available.</Muted>}</Screen>;

  let top;
  if (queued && queued.status !== 'sent') top = <QueuedReport item={queued} />;
  else if (onServer || queued) top = <SentReport r={onServer} item={queued} />;
  else if (!canWork) {
    top = <><H1>Daily report</H1><Muted>{site.status === 'closed' ? 'This site is closed, so no new reports can be sent.' : 'Your role can view this site but not send reports.'}</Muted></>;
  } else {
    top = <ReportForm cid={cid} site={site} uid={user.uid} name={profile.name} presentCount={presentCount} logs={logs} draftKey={draftKey} />;
  }

  return (
    <Screen>
      {top}
      <RecentReports cid={cid} sid={sid} outbox={outbox} />
    </Screen>
  );
}

function ReportForm({ cid, site, uid, name, presentCount, logs, draftKey }) {
  const blank = { text: '', notes: '', issues: '', weather: '', stage: site.stage || STAGES[0], progress: String(site.progress || 0), workersPresent: '', photos: [] };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const ready = useRef(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  // Restore an unsent draft, then keep saving it as the user types
  useEffect(() => { readDraft(draftKey).then((d) => { if (d) setF((p) => ({ ...p, ...d })); ready.current = true; }); }, [draftKey]);
  useEffect(() => { if (ready.current) writeDraft(draftKey, f); }, [draftKey, f]);

  const workers = f.workersPresent === '' ? String(presentCount) : f.workersPresent;
  const materials = materialsUsed(logs);
  const addPhrase = (p) => set('text')(f.text.trim() ? `${f.text.trim()}. ${p}` : p);
  const nudge = (k, by, max) => set(k)(String(Math.max(0, Math.min(max, (Number(k === 'workersPresent' ? workers : f[k]) || 0) + by))));

  async function addPhotos(fromCamera) {
    const room = REPORT_PHOTO_LIMIT - f.photos.length;
    if (room <= 0) return setErr(`You can add up to ${REPORT_PHOTO_LIMIT} photos.`);
    if (fromCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return setErr('Allow camera access in your phone settings to take site photos.');
    }
    const r = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true, selectionLimit: room, quality: 0.8 });
    if (!r.canceled) set('photos')([...f.photos, ...r.assets.map((a) => a.uri)].slice(0, REPORT_PHOTO_LIMIT));
  }

  async function submit() {
    setErr('');
    const v = validate(reportInput, { ...f, workersPresent: workers, photos: f.photos });
    if (!v.ok) return setErr(v.error);
    setBusy(true);
    try {
      const { photos: _p, ...input } = v.data;
      await queueReport({ cid, site, uid, name, input, materials, photoUris: f.photos });
      await clearDraft(draftKey);
    } catch (e) {
      console.warn('Report not saved', e);
      setErr(e.code === 'already-exists' ? "Today's report is already saved." : 'Could not save the report on this phone. Your text is still here. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <H1>Daily report</H1>
      <Muted style={{ marginBottom: 12 }}>{prettyDate(todayKey())}. Saved on your phone first, so it works without signal.</Muted>
      <ErrorText>{err}</ErrorText>

      <Field label="Work done today" value={f.text} onChangeText={set('text')} multiline placeholder="What did the team do today?" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -6, marginBottom: 14 }}>
        {WORK_PHRASES.slice(0, 12).map((p) => (
          <Pressable key={p} onPress={() => addPhrase(p)} accessibilityRole="button" style={[s.chip, { marginRight: 0, paddingVertical: 6 }]}>
            <Text style={{ color: colors.ink, fontSize: 13 }}>+ {p}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.label}>Workers on site</Text>
      <Stepper value={workers} onMinus={() => nudge('workersPresent', -1, 2000)} onPlus={() => nudge('workersPresent', 1, 2000)} onChange={set('workersPresent')}
        hint={presentCount ? `${presentCount} marked present today` : 'From attendance, or set the number'} />

      <Choice label="Weather" options={WEATHER} value={f.weather} onChange={(w) => set('weather')(f.weather === w ? '' : w)} />
      <Choice label="Current stage" options={[...new Set([...STAGES, f.stage])]} value={f.stage} onChange={set('stage')} />

      <Text style={s.label}>Overall progress (%)</Text>
      <Stepper value={f.progress} step={5} onMinus={() => nudge('progress', -5, 100)} onPlus={() => nudge('progress', 5, 100)} onChange={set('progress')}
        hint={`Was ${site.progress || 0}%`} />

      <Field label="Issues or delays" value={f.issues} onChangeText={set('issues')} multiline placeholder="Leave empty if none" />

      <Text style={s.label}>Photos ({f.photos.length}/{REPORT_PHOTO_LIMIT})</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {f.photos.map((uri) => (
          <View key={uri}>
            <Image source={{ uri }} style={{ width: 84, height: 64, borderRadius: 6 }} />
            <Pressable onPress={() => set('photos')(f.photos.filter((x) => x !== uri))} accessibilityRole="button" accessibilityLabel="Remove photo"
              style={{ position: 'absolute', top: -8, right: -8, backgroundColor: colors.bad, borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>✕</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        <Button title="Take photo" variant="ghost" onPress={() => addPhotos(true)} style={{ flex: 1 }} />
        <Button title="From gallery" variant="ghost" onPress={() => addPhotos(false)} style={{ flex: 1 }} />
      </View>

      {more ? (
        <Field label="Notes" value={f.notes} onChangeText={set('notes')} multiline placeholder="Visitors, instructions received, plans for tomorrow" />
      ) : (
        <Button title="Add notes" variant="ghost" onPress={() => setMore(true)} style={{ marginBottom: 14 }} />
      )}

      {!!materials.length && (
        <Card style={{ padding: 12, marginBottom: 14 }}>
          <Text style={{ fontWeight: '600', color: colors.ink, marginBottom: 4 }}>Materials used today (added to the report)</Text>
          {materials.map((m) => <Muted key={m.materialId}>{m.name}: {m.qty} {m.unit}</Muted>)}
        </Card>
      )}

      <Button title={busy ? 'Saving…' : 'Send report'} onPress={submit} disabled={busy} />
      <Muted style={{ marginTop: 8, fontSize: 13 }}>Your draft is kept on this phone until you send it.</Muted>
    </>
  );
}

function Stepper({ value, onMinus, onPlus, onChange, hint, step = 1 }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Button title={`−${step === 1 ? '' : step}`} variant="ghost" onPress={onMinus} style={{ width: 64 }} />
        <View style={{ flex: 1 }}>
          <Field label="" value={String(value)} onChangeText={onChange} keyboardType="number-pad" accessibilityLabel={hint} style={{ textAlign: 'center', fontSize: 20, fontWeight: '700' }} />
        </View>
        <Button title={`+${step === 1 ? '' : step}`} variant="ghost" onPress={onPlus} style={{ width: 64 }} />
      </View>
      {hint ? <Muted style={{ fontSize: 13 }}>{hint}</Muted> : null}
    </View>
  );
}

function QueuedReport({ item }) {
  const [kind, text] = STATUS[item.status];
  const confirmDelete = () => Alert.alert('Delete this report?', 'It has not reached the office. Its text and photos will be removed from this phone.', [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => deleteReport(item.id) },
  ]);
  return (
    <>
      <H1>Daily report</H1>
      <Card style={{ padding: 14, marginBottom: 8 }}>
        <Pill kind={kind}>{item.status === 'failed' ? 'Not sent' : item.status === 'sending' ? 'Sending' : 'Waiting for signal'}</Pill>
        <Text style={{ color: colors.ink, marginTop: 8 }}>{text}{item.status === 'failed' && item.error ? ` ${item.error}` : ''}</Text>
        <Text style={{ color: colors.ink, marginTop: 8 }} numberOfLines={3}>{item.input.text}</Text>
        <Muted>{item.input.workersPresent} workers, {item.input.stage} {item.input.progress}%, {item.photos.length} photo{item.photos.length === 1 ? '' : 's'}</Muted>
      </Card>
      {item.status === 'failed' && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Try again" onPress={() => retryReport(item.id)} style={{ flex: 1 }} />
          <Button title="Delete" variant="ghost" onPress={confirmDelete} style={{ flex: 1 }} />
        </View>
      )}
    </>
  );
}

function SentReport({ r, item }) {
  const time = r?.time || item?.time;
  const pending = r ? (r.photoCount || 0) - (r.photos?.length || 0) : 0;
  return (
    <>
      <H1>Daily report</H1>
      <Card style={{ padding: 14 }}>
        <Pill kind="ok">Sent{time ? ` at ${time}` : ''}</Pill>
        <Text style={{ color: colors.ink, marginTop: 8 }}>{r?.text || item?.input.text}</Text>
        {r ? <Muted>{r.workersPresent} workers, {r.stage} {r.progress}%{r.photos?.length ? `, ${r.photos.length} photos` : ''}</Muted> : null}
        {pending > 0 ? <Muted>{pending} photo(s) still uploading.</Muted> : null}
      </Card>
      <Muted style={{ marginTop: 8 }}>One report per day. Tomorrow's report opens here tomorrow.</Muted>
    </>
  );
}

function RecentReports({ cid, sid, outbox }) {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(null);
  useEffect(() => siteReportsQuery(cid, sid, 7).onSnapshot((q) => setList(toList(q)), () => {}), [cid, sid]);
  const waiting = outbox.filter((x) => x.sid === sid && x.status !== 'sent');
  if (!list.length && !waiting.length) return null;
  return (
    <>
      <H2>Recent reports</H2>
      <Card>
        {waiting.map((x, i) => (
          <View key={x.id} style={[s.row, i === 0 && { borderTopWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: colors.ink }}>{prettyDate(x.date)}, {x.name}</Text>
              <Muted numberOfLines={1}>{x.input.text}</Muted>
            </View>
            <Pill kind={x.status === 'failed' ? 'bad' : 'warn'}>{x.status === 'failed' ? 'Not sent' : 'On phone'}</Pill>
          </View>
        ))}
        {list.map((r, i) => (
          <Pressable key={r.id} onPress={() => setOpen(open === r.id ? null : r.id)} accessibilityRole="button"
            style={[s.row, i === 0 && !waiting.length && { borderTopWidth: 0 }, { flexDirection: 'column', alignItems: 'stretch' }]}>
            <Text style={{ fontWeight: '600', color: colors.ink }}>{prettyDate(r.date)}, {r.createdByName}</Text>
            <Muted numberOfLines={open === r.id ? undefined : 1}>{r.text}</Muted>
            {open === r.id ? (
              <>
                {r.issues ? <Text style={{ color: colors.bad, marginTop: 4 }}>Issue: {r.issues}</Text> : null}
                {r.notes ? <Muted style={{ marginTop: 4 }}>Notes: {r.notes}</Muted> : null}
                <Muted>{r.workersPresent} workers, {r.stage} {r.progress}%{r.weather ? `, ${r.weather}` : ''}</Muted>
                {r.photos?.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {r.photos.map((u) => <Image key={u} source={{ uri: u }} style={{ width: 72, height: 54, borderRadius: 4 }} />)}
                  </View>
                ) : null}
              </>
            ) : null}
          </Pressable>
        ))}
      </Card>
    </>
  );
}
