import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import {
  ISSUE_PRIORITY_LABELS, ISSUE_STATUS_LABELS, commentInput, isSiteOpen, issueActions, prettyDate, resolveInput, validate,
} from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { addComment, commentsQuery, exists, issueRef, siteRef, toList, updateIssue } from '../lib/db';
import { Button, Card, ErrorText, Field, H1, H2, Muted, Pill, Screen, s } from '../components/ui';
import { PRIORITY_COLOR } from './IssuesScreen';
import { colors } from '../theme';

// One issue: details, photos, what this person can do next, and the timeline
export default function IssueScreen({ route }) {
  const { sid, id } = route.params;
  const { cid, user, profile, role } = useAuth();
  const [issue, setIssue] = useState(undefined);
  const [site, setSite] = useState(null);
  const [comments, setComments] = useState([]);
  useEffect(() => issueRef(cid, sid, id).onSnapshot((d) => setIssue(exists(d) ? { id: d.id, ...d.data() } : null), () => setIssue(null)), [cid, sid, id]);
  useEffect(() => siteRef(cid, sid).onSnapshot((d) => setSite(exists(d) ? d.data() : null), () => {}), [cid, sid]);
  useEffect(() => commentsQuery(cid, sid, id).onSnapshot((q) => setComments(toList(q)), () => {}), [cid, sid, id]);

  if (issue === undefined) return <Screen><Muted>Loading…</Muted></Screen>;
  if (!issue) return <Screen><Muted>This issue is not available.</Muted></Screen>;
  const act = issueActions(issue, { uid: user.uid, role }, isSiteOpen(site));
  const me = { uid: user.uid, name: profile.name };

  return (
    <Screen>
      <View style={{ borderLeftWidth: 5, borderLeftColor: PRIORITY_COLOR[issue.priority], paddingLeft: 10, marginBottom: 12 }}>
        <H1>{issue.title}</H1>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <Pill kind={issue.priority === 'critical' || issue.priority === 'high' ? 'bad' : 'warn'}>{ISSUE_PRIORITY_LABELS[issue.priority]}</Pill>
          <Pill kind={issue.status === 'resolved' || issue.status === 'closed' ? 'ok' : 'warn'}>{ISSUE_STATUS_LABELS[issue.status]}</Pill>
        </View>
      </View>
      <Card>
        {[
          ['About', `${issue.category}${issue.location ? `, ${issue.location}` : ''}`],
          ['Reported', `${prettyDate(issue.date)} by ${issue.createdByName}`],
          ['Given to', issue.assignedToName || 'Nobody yet'],
          ['Fix by', issue.dueDate ? prettyDate(issue.dueDate) : '–'],
          ...(issue.resolution ? [['Fixed', issue.resolution]] : []),
        ].map(([k, v], i) => (
          <View key={k} style={[s.row, i === 0 && { borderTopWidth: 0 }]}>
            <Text style={{ color: colors.muted, width: 80 }}>{k}</Text><Text style={{ color: colors.ink, flex: 1 }}>{v}</Text>
          </View>
        ))}
      </Card>
      {issue.description ? <Text style={{ color: colors.ink, marginTop: 12 }}>{issue.description}</Text> : null}
      {issue.photos?.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {issue.photos.map((u) => <Image key={u} source={{ uri: u }} style={{ width: 104, height: 78, borderRadius: 6 }} />)}
        </View>
      ) : null}

      <NextSteps cid={cid} sid={sid} issue={issue} act={act} me={me} />

      <H2>Timeline</H2>
      <Card>
        <View style={[s.row, { borderTopWidth: 0, flexDirection: 'column', alignItems: 'flex-start' }]}>
          <Text style={{ color: colors.ink }}><Text style={{ fontWeight: '600' }}>{issue.createdByName}</Text> reported this.</Text>
        </View>
        {comments.map((c) => (
          <View key={c.id} style={[s.row, { flexDirection: 'column', alignItems: 'flex-start' }]}>
            <Text style={{ color: c.kind === 'update' ? colors.muted : colors.ink }}><Text style={{ fontWeight: '600', color: colors.ink }}>{c.createdByName}</Text> {c.text}</Text>
            <Muted style={{ fontSize: 12 }}>{c.createdAt?.toDate ? c.createdAt.toDate().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sending…'}</Muted>
          </View>
        ))}
      </Card>
      {act.comment ? <CommentBox cid={cid} sid={sid} id={id} me={me} /> : null}
    </Screen>
  );
}

function NextSteps({ cid, sid, issue, act, me }) {
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState('');
  const [err, setErr] = useState('');
  if (!act.start && !act.resolve && !act.close && !act.reopen) return null;
  const change = (patch, note) => updateIssue(cid, sid, { id: issue.id, patch, note, ...me });

  function resolve() {
    const v = validate(resolveInput, { resolution });
    if (!v.ok) return setErr(v.error);
    change({ status: 'resolved', resolution: v.data.resolution, resolvedBy: me.uid, resolvedByName: me.name }, `marked it resolved: ${v.data.resolution}`);
    setResolving(false); setResolution(''); setErr('');
  }

  return (
    <>
      <H2>What next</H2>
      <ErrorText>{err}</ErrorText>
      {act.start && <Button title="Start working on it" onPress={() => change({ status: 'in_progress' }, 'started working on it')} style={{ marginBottom: 8 }} />}
      {act.resolve && !resolving && <Button title="Mark resolved" onPress={() => setResolving(true)} style={{ marginBottom: 8 }} />}
      {resolving && (
        <>
          <Field label="How was it fixed?" value={resolution} onChangeText={setResolution} multiline />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <Button title="Save as resolved" onPress={resolve} style={{ flex: 1 }} />
            <Button title="Cancel" variant="ghost" onPress={() => setResolving(false)} style={{ flex: 1 }} />
          </View>
        </>
      )}
      {act.close && <Button title="Check and close" onPress={() => change({ status: 'closed' }, 'checked the fix and closed it')} style={{ marginBottom: 8 }} />}
      {act.reopen && <Button title="Reopen" variant="ghost" onPress={() => change({ status: 'open' }, 'reopened it')} />}
      <Muted style={{ fontSize: 13 }}>Assigning and changing priority is done on the web.</Muted>
    </>
  );
}

function CommentBox({ cid, sid, id, me }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  function post() {
    const v = validate(commentInput, { text });
    if (!v.ok) return setErr(v.error);
    addComment(cid, sid, { id, text: v.data.text, ...me });
    setText(''); setErr('');
  }
  return (
    <View style={{ marginTop: 12 }}>
      <ErrorText>{err}</ErrorText>
      <Field label="Add a comment" value={text} onChangeText={setText} multiline placeholder="Updates, questions, what you need" />
      <Button title="Post comment" variant="ghost" onPress={post} />
    </View>
  );
}
