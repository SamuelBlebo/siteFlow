import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import {
  REPORT_PHOTO_LIMIT, STAGES, STAGE_MAX, WEATHER, WORK_PHRASES, materialsUsed, prettyDate, reportId, reportInput, stagesFor, todayKey, validate, photoThumb, workTypeOf,
} from '@siteflow/shared';
import { useSite } from '../site/SiteContext';
import { useAuth } from '../auth/AuthProvider';
import { exists, reportRef, siteReportsQuery, toList, todayLogsQuery } from '../lib/db';
import { deleteReport, outboxKey, queueReport, retryReport } from '../lib/reportOutbox';
import { useOutbox } from '../lib/useOutbox';
import { clearDraft, readDraft, writeDraft } from '../lib/drafts';
import { Button, Card, Choice, Empty, ErrorText, ErrorView, Field, H1, H2, Loading, Muted, Pill, Screen, s } from '../components/ui';
import { colors } from '../theme';
import PhotoPicker from '../components/PhotoPicker';

const STATUS = {
  waiting: ['warn', 'Saved on this phone. It sends as soon as there is signal.'],
  sending: ['warn', 'Sending…'],
  sent: ['ok', 'Sent. The office can see it.'],
  failed: ['bad', 'Not sent.'],
};

export default function ReportScreen() {
  const { user, profile } = useAuth();
  const { cid, sid, site, loading, error, presentCount, canWork, milestones } = useSite();
  const outbox = useOutbox();
  const [onServer, setOnServer] = useState(null);
  const [logs, setLogs] = useState([]);
  const today = todayKey();
  const draftKey = `report:${sid}:${user.uid}:${today}`;
  const queued = outbox.find((x) => x.id === outboxKey(sid, user.uid, today));

  useEffect(() => reportRef(cid, sid, reportId(today, user.uid)).onSnapshot(
    (d) => setOnServer(exists(d) ? d.data() : null), (e) => console.warn('Could not check today\'s report', e)), [cid, sid, user.uid, today]);
  useEffect(() => todayLogsQuery(cid, sid).onSnapshot((q) => setLogs(toList(q)), () => {}), [cid, sid]);

  if (loading) return <Screen><Loading what="site" /></Screen>;
  if (!site) return <Screen>{error ? <ErrorView error={error} what="this site" /> : <Empty>This site is not available. Ask your manager if you should have access.</Empty>}</Screen>;

  let top;
  if (queued && queued.status !== 'sent') top = <QueuedReport item={queued} />;
  else if (onServer || queued) top = <SentReport r={onServer} item={queued} />;
  else if (!canWork) {
    top = <><H1>Daily report</H1><Muted>{site.status === 'closed' ? 'This site is closed, so no new reports can be sent.' : 'Your role can view this site but not send reports.'}</Muted></>;
  } else {
    top = <ReportForm cid={cid} site={site} uid={user.uid} name={profile.name} presentCount={presentCount} logs={logs} draftKey={draftKey} fromMilestones={milestones.length > 0} />;
  }

  return (
    <Screen>
      {top}
      <RecentReports cid={cid} sid={sid} outbox={outbox} />
    </Screen>
  );
}

function ReportForm({ cid, site, uid, name, presentCount, logs, draftKey, fromMilestones }) {
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

  async function submit() {
    setErr('');
    const v = validate(reportInput, { ...f, workersPresent: workers, photos: f.photos, progress: fromMilestones ? site.progress || 0 : f.progress });
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
      <StagePicker value={f.stage} onChange={set('stage')} />

      <Text style={s.label}>Overall progress</Text>
      {fromMilestones
        ? <Muted style={{ marginBottom: 14 }}>{site.progress || 0}%, from the milestones. Update them on the Today tab.</Muted>
        : <Stepper value={f.progress} step={5} onMinus={() => nudge('progress', -5, 100)} onPlus={() => nudge('progress', 5, 100)} onChange={set('progress')}
            hint={`Was ${site.progress || 0}%`} />}

      <Field label="Issues or delays" value={f.issues} onChangeText={set('issues')} multiline placeholder="Leave empty if none" />

      <PhotoPicker photos={f.photos} onChange={set('photos')} limit={REPORT_PHOTO_LIMIT} />

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
        <Button title={`−${step === 1 ? '' : step}`} variant="ghost" onPress={onMinus} style={{ width: 64 }} accessibilityLabel={`Less, by ${step}`} />
        <View style={{ flex: 1 }}>
          <Field label="" value={String(value)} onChangeText={onChange} keyboardType="number-pad" accessibilityLabel={hint} style={{ textAlign: 'center', fontSize: 20, fontWeight: '700' }} />
        </View>
        <Button title={`+${step === 1 ? '' : step}`} variant="ghost" onPress={onPlus} style={{ width: 64 }} accessibilityLabel={`More, by ${step}`} />
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
                    {r.photos.map((u, i) => <Image key={u} source={{ uri: photoThumb(r, i) }} style={{ width: 72, height: 54, borderRadius: 4 }} />)}
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

// Current stage: the usual stages for this kind of work, or any stage typed in (roads, bridges, utilities...)
const TYPE_IN = 'Other…';
function StagePicker({ value, onChange }) {
  const [list] = useState(() => stagesFor(workTypeOf(value)));
  const [typing, setTyping] = useState(() => !list.length || (!!value && !list.includes(value)));
  return (
    <>
      {list.length ? <Choice label="Current stage" options={[...list, TYPE_IN]} value={typing ? TYPE_IN : value}
        onChange={(v) => { if (v === TYPE_IN) { setTyping(true); onChange(''); } else { setTyping(false); onChange(v); } }} /> : null}
      {typing ? <Field label={list.length ? 'Type the stage' : 'Current stage'} value={value} onChangeText={onChange} maxLength={STAGE_MAX} placeholder="e.g. Kerb laying" /> : null}
    </>
  );
}
