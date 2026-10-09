import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import {
  ISSUE_CATEGORIES, ISSUE_PHOTO_LIMIT, ISSUE_PRIORITIES, ISSUE_PRIORITY_HINTS, ISSUE_PRIORITY_LABELS, ISSUE_STATUS_LABELS, filterIssues, isOpenIssue,
  issueInput, prettyDate, sortIssues, validate,
} from '@siteflow/shared';
import { useSite } from '../site/SiteContext';
import { useAuth } from '../auth/AuthProvider';
import { siteIssuesQuery, toList } from '../lib/db';
import { deleteReport, queueIssue, retryReport } from '../lib/reportOutbox';
import { useOutbox } from '../lib/useOutbox';
import { clearDraft, readDraft, writeDraft } from '../lib/drafts';
import { Button, Card, Choice, Empty, ErrorText, ErrorView, Field, H1, Loading, Muted, Notice, Screen, s } from '../components/ui';
import { colors } from '../theme';
import PhotoPicker from '../components/PhotoPicker';

export const PRIORITY_COLOR = { critical: colors.bad, high: colors.bad, medium: colors.warn, low: colors.muted };

export default function IssuesScreen({ navigation }) {
  const { cid, sid, site, error, canWork } = useSite();
  const outbox = useOutbox();
  const [issues, setIssues] = useState(null); // null until the first load
  const [loadError, setLoadError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [saved, setSaved] = useState('');
  useEffect(() => siteIssuesQuery(cid, sid).onSnapshot((q) => { setIssues(toList(q)); setLoadError(null); }, (e) => { console.warn('Could not load issues', e); setLoadError(e); setIssues((p) => p || []); }), [cid, sid]);

  const onPhone = outbox.filter((x) => x.kind === 'issue' && x.sid === sid && x.status !== 'sent');
  const shown = sortIssues(filterIssues(issues || [], { status: showAll ? 'all' : 'open' }));
  const finished = (issues || []).filter((i) => !isOpenIssue(i.status)).length;

  if (reporting) {
    return <ReportIssue cid={cid} site={site} onDone={(msg) => { setReporting(false); if (msg) setSaved(msg); }} />;
  }
  return (
    <Screen>
      <H1>Issues</H1>
      {error ? <ErrorView error={error} what="some site data" /> : null}
      {saved ? <Notice>{saved}</Notice> : null}
      {canWork && <Button title="Report a problem" onPress={() => { setSaved(''); setReporting(true); }} style={{ marginBottom: 14, minHeight: 56 }} />}

      {onPhone.map((x) => (
        <Card key={x.id} style={{ padding: 12, marginBottom: 8 }}>
          <Text style={{ fontWeight: '600', color: colors.ink }}>{x.input.title}</Text>
          <Muted>{x.status === 'failed' ? `Not sent. ${x.error}` : 'Saved on this phone. Sends when there is signal.'}</Muted>
          {x.status === 'failed' && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Button title="Try again" onPress={() => retryReport(x.id)} style={{ flex: 1, paddingVertical: 10 }} />
              <Button title="Delete" variant="ghost" style={{ flex: 1, paddingVertical: 10 }} onPress={() => Alert.alert('Delete this issue?', 'It has not reached the office.', [
                { text: 'Keep it', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteReport(x.id) },
              ])} />
            </View>
          )}
        </Card>
      ))}

      {loadError ? <ErrorView error={loadError} what="issues" /> : null}
      {issues === null ? <Loading what="issues" /> : !shown.length && !onPhone.length ? (
        <Empty>{showAll ? 'No issues reported on this site.' : 'No open issues on this site.'}</Empty>
      ) : (
        <Card>
          {shown.map((i, n) => (
            <Pressable key={i.id} onPress={() => navigation.navigate('Issue', { sid, id: i.id, name: i.title })} accessibilityRole="button"
              style={[s.row, n === 0 && { borderTopWidth: 0 }, i.priority === 'critical' && isOpenIssue(i.status) && { borderLeftWidth: 5, borderLeftColor: colors.bad }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: colors.ink }}>{i.title}</Text>
                <Muted>{ISSUE_PRIORITY_LABELS[i.priority]} · {ISSUE_STATUS_LABELS[i.status]} · {i.assignedToName ? `With ${i.assignedToName}` : 'Not assigned'}</Muted>
                <Muted style={{ fontSize: 12 }}>{prettyDate(i.date)}, {i.createdByName}{i.commentCount ? ` · ${i.commentCount} comments` : ''}</Muted>
              </View>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: PRIORITY_COLOR[i.priority] }} />
            </Pressable>
          ))}
        </Card>
      )}
      {!!finished && <Button title={showAll ? 'Hide resolved and closed' : `Show ${finished} resolved or closed`} variant="ghost" onPress={() => setShowAll(!showAll)} style={{ marginTop: 12 }} />}
    </Screen>
  );
}

function ReportIssue({ cid, site, onDone }) {
  const { user, profile } = useAuth();
  const [f, setF] = useState({ title: '', priority: '', category: '', location: '', description: '' });
  const [photos, setPhotos] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  // The text is kept on the phone as it is typed, so a closed app or a flat battery loses nothing
  const draftKey = `issue:${site.id}:${user.uid}`;
  const ready = useRef(false);
  useEffect(() => { readDraft(draftKey).then((d) => { if (d) setF((p) => ({ ...p, ...d })); ready.current = true; }); }, [draftKey]);
  useEffect(() => { if (ready.current) writeDraft(draftKey, f); }, [draftKey, f]);

  async function submit() {
    setErr('');
    const v = validate(issueInput, f);
    if (!v.ok) return setErr(v.error);
    setBusy(true);
    try {
      const { photos: _p, ...input } = v.data;
      await queueIssue({ cid, site, uid: user.uid, name: profile.name, input, photoUris: photos });
      await clearDraft(draftKey);
      onDone('Issue saved. It reaches the office as soon as there is signal.');
    } catch (e) {
      console.warn('Issue not saved', e);
      setErr('Could not save the issue on this phone. Your text is still here. Try again.');
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>Report a problem</H1>
      <ErrorText>{err}</ErrorText>
      <Field label="What is the problem?" value={f.title} onChangeText={set('title')} placeholder="e.g. Water pipe burst near the store" />
      <Text style={s.label}>How urgent?</Text>
      <View style={{ gap: 8, marginBottom: 14 }}>
        {ISSUE_PRIORITIES.map((p) => {
          const on = f.priority === p;
          return (
            <Pressable key={p} onPress={() => set('priority')(p)} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={{ borderWidth: on ? 2 : 1, borderColor: on ? PRIORITY_COLOR[p] : colors.line, borderRadius: 10, padding: 12, backgroundColor: colors.surface }}>
              <Text style={{ fontWeight: '700', color: on ? PRIORITY_COLOR[p] : colors.ink }}>{ISSUE_PRIORITY_LABELS[p]}</Text>
              <Muted>{ISSUE_PRIORITY_HINTS[p]}</Muted>
            </Pressable>
          );
        })}
      </View>
      <Choice label="About" options={ISSUE_CATEGORIES} value={f.category} onChange={set('category')} />
      <Field label="Where on site (optional)" value={f.location} onChangeText={set('location')} placeholder="e.g. Block B, first floor" />
      <Field label="Details (optional)" value={f.description} onChangeText={set('description')} multiline />
      <PhotoPicker photos={photos} onChange={setPhotos} limit={ISSUE_PHOTO_LIMIT} />
      <Button title={busy ? 'Saving…' : 'Report problem'} onPress={submit} disabled={busy} />
      <Button title="Discard" variant="ghost" onPress={() => { clearDraft(draftKey); onDone(null); }} style={{ marginTop: 8 }} />
      <Muted style={{ marginTop: 8, fontSize: 13 }}>Your text is kept on this phone until you send or discard it. Saved on your phone first, so it works without signal.</Muted>
    </Screen>
  );
}
