import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { dismiss, getJournal, getSyncState, reconcile, retry, retryAll, subscribe } from '../lib/sync';
import { deleteReport, processOutbox, retryReport } from '../lib/reportOutbox';
import { useOutbox } from '../lib/useOutbox';
import { Button, Card, H1, H2, Muted, Pill, Row, Screen } from '../components/ui';
import { colors } from '../theme';

const when = (ms) => {
  if (!ms) return '';
  const d = new Date(ms);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${time}`;
};

// Everything on this phone that has not reached the office yet, and what went wrong with it
export default function SyncScreen() {
  const [st, setSt] = useState(getSyncState());
  const [journal, setJournal] = useState(getJournal());
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribe((x) => { setSt(x); setJournal(getJournal()); }), []);
  const outbox = useOutbox().filter((x) => x.status !== 'sent');

  const failed = journal.filter((e) => e.status === 'failed').length + outbox.filter((x) => x.status === 'failed').length;
  const waiting = journal.length + outbox.length - failed;
  const [label, kind] = !st.online ? ['Offline', 'warn'] : failed ? ['Not saved', 'bad'] : (st.syncing || waiting) ? ['Syncing', 'warn'] : ['All saved', 'ok'];

  async function sendNow() {
    setBusy(true);
    try {
      await Promise.all([reconcile(), processOutbox()]);
    } finally { setBusy(false); }
  }
  async function tryAll() {
    setBusy(true);
    try {
      await retryAll();
      for (const x of outbox.filter((i) => i.status === 'failed')) await retryReport(x.id);
    } finally { setBusy(false); }
  }
  const confirmDelete = (x) => Alert.alert('Delete from this phone?', `${x.label} and its photos will be removed. It has not reached the office.`, [
    { text: 'Keep it', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteReport(x.id) },
  ]);
  const confirmDismiss = (e) => Alert.alert('Remove this change?', `${e.label} did not reach the office. Removing it here means it will not be sent.`, [
    { text: 'Keep it', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => dismiss(e.id) },
  ]);

  return (
    <Screen banner={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <H1 style={{ marginBottom: 0 }}>Sync</H1>
        <Pill kind={kind}>{label}</Pill>
      </View>
      <Muted style={{ marginTop: 6 }}>
        {!st.online ? 'No signal. Everything you save stays on this phone and is sent when signal returns.'
          : failed ? 'Some changes were refused by the office. They are kept below until you try again or remove them.'
            : waiting ? `${waiting} change${waiting === 1 ? '' : 's'} on the way.` : 'Everything on this phone has reached the office.'}
      </Muted>
      {!!st.lastSyncedAt && <Muted style={{ marginTop: 4 }}>Last confirmed: {when(st.lastSyncedAt)}</Muted>}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        <Button title={busy ? 'Working…' : 'Send now'} onPress={sendNow} disabled={busy || !st.online} style={{ flex: 1 }} />
        {failed > 0 && <Button title="Try all again" variant="ghost" onPress={tryAll} disabled={busy} style={{ flex: 1 }} />}
      </View>

      {outbox.length > 0 && (
        <>
          <H2>Reports and issues</H2>
          <Card>
            {outbox.map((x, i) => (
              <Row key={x.id} style={i === 0 ? { borderTopWidth: 0 } : null}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: colors.ink }}>{x.label || x.id}</Text>
                  <Muted style={{ fontSize: 13 }}>
                    {x.status === 'failed' ? x.error : x.status === 'sending' ? 'Sending now…' : `Waiting for signal${x.attempts ? ` (tried ${x.attempts} time${x.attempts === 1 ? '' : 's'})` : ''}`}
                    {x.photos?.length ? ` · ${x.photos.filter((p) => p.url).length}/${x.photos.length} photos up` : ''}
                  </Muted>
                  {x.status === 'failed' && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <Button title="Try again" onPress={() => retryReport(x.id)} style={{ flex: 1, paddingVertical: 10 }} />
                      <Button title="Delete" variant="ghost" onPress={() => confirmDelete(x)} style={{ flex: 1, paddingVertical: 10 }} />
                    </View>
                  )}
                </View>
                <Pill kind={x.status === 'failed' ? 'bad' : 'warn'}>{x.status === 'failed' ? 'Not sent' : 'Waiting'}</Pill>
              </Row>
            ))}
          </Card>
        </>
      )}

      {journal.length > 0 && (
        <>
          <H2>Other changes</H2>
          <Card>
            {journal.map((e, i) => (
              <Row key={e.id} style={i === 0 ? { borderTopWidth: 0 } : null}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: colors.ink }}>{e.label}</Text>
                  <Muted style={{ fontSize: 13 }}>{e.status === 'failed' ? e.message : `Saved on this phone ${when(e.at)}, waiting for the office to confirm`}</Muted>
                  {e.status === 'failed' && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <Button title="Try again" onPress={() => retry(e.id)} style={{ flex: 1, paddingVertical: 10 }} />
                      <Button title="Remove" variant="ghost" onPress={() => confirmDismiss(e)} style={{ flex: 1, paddingVertical: 10 }} />
                    </View>
                  )}
                </View>
                <Pill kind={e.status === 'failed' ? 'bad' : 'warn'}>{e.status === 'failed' ? 'Not saved' : 'Waiting'}</Pill>
              </Row>
            ))}
          </Card>
        </>
      )}

      {!outbox.length && !journal.length && (
        <Card style={{ padding: 16, marginTop: 16 }}><Muted>Nothing waiting. Reports, attendance, materials and issues you save appear here until the office has them.</Muted></Card>
      )}
    </Screen>
  );
}
