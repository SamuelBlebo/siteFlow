import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useSite } from '../site/SiteContext';
import { useAuth } from '../auth/AuthProvider';
import { addWorker, markAttendance } from '../lib/db';
import { TRADES, cedi, dailyWages, validate, workerInput, workerPayInput } from '@siteflow/shared';
import { Button, Card, Choice, ErrorText, ErrorView, Field, H1, H2, Muted, Notice, Screen, s } from '../components/ui';
import { colors } from '../theme';

export default function WorkersScreen() {
  const { user, can } = useAuth();
  const { cid, sid, workers, present, presentCount, pay, error, canWork: work } = useSite();
  const withPay = can('finance.edit');
  const [name, setName] = useState('');
  const [trade, setTrade] = useState(TRADES[0]);
  const [rate, setRate] = useState('');
  const [msg, setMsg] = useState({ kind: '', text: '' });

  const toggle = (w) => markAttendance(cid, sid, { workerId: w.id, workerName: w.name, present: !present[w.id], uid: user.uid });

  function add() {
    const v = validate(workerInput, { name, trade });
    if (!v.ok) return setMsg({ kind: 'err', text: v.error });
    let dailyRate = 0;
    if (withPay && rate !== '') {
      const p = validate(workerPayInput, { dailyRate: rate });
      if (!p.ok) return setMsg({ kind: 'err', text: p.error });
      dailyRate = p.data.dailyRate;
    }
    addWorker(cid, sid, { ...v.data, dailyRate, uid: user.uid });
    setMsg({ kind: 'ok', text: `${v.data.name} added.` });
    setName(''); setRate('');
  }

  return (
    <Screen>
      <H1>Attendance</H1>
      <Muted style={{ marginBottom: 12 }}>{work ? 'Tick everyone who came to site today.' : 'Who came to site today.'}</Muted>
      {error ? <ErrorView error={error} what="some site data" /> : null}
      <Card>
        {!workers.length ? <Text style={{ padding: 14, color: colors.muted }}>No workers yet.{work ? ' Add them below.' : ''}</Text> :
          workers.map((w, i) => (
            <View key={w.id} style={[s.row, i === 0 && { borderTopWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: colors.ink }}>{w.name}</Text>
                <Muted>{w.trade}{pay ? `, ${pay[w.id] ? `${cedi(pay[w.id].dailyRate)} a day` : 'no rate set'}` : ''}</Muted>
              </View>
              <Switch value={!!present[w.id]} disabled={!work} onValueChange={() => toggle(w)} trackColor={{ true: colors.ok }} accessibilityLabel={`${w.name} present`} />
            </View>
          ))}
      </Card>
      <Card style={{ marginTop: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.ink }}>{presentCount} present</Text>
        {pay ? <Text style={{ fontWeight: '700', color: colors.ink }}>Wages today: {cedi(dailyWages(workers, pay, present))}</Text> : null}
      </Card>

      {work && (
        <>
          <H2>Add a worker</H2>
          {msg.kind === 'err' ? <ErrorText>{msg.text}</ErrorText> : msg.text ? <Notice>{msg.text}</Notice> : null}
          <Field label="Name" value={name} onChangeText={setName} />
          <Choice label="Trade" options={TRADES} value={trade} onChange={setTrade} />
          {withPay
            ? <Field label="Daily rate (GH₵)" value={rate} onChangeText={setRate} keyboardType="number-pad" />
            : <Muted style={{ marginBottom: 12 }}>The office sets the daily rate.</Muted>}
          <Button title="Add worker" variant="ghost" onPress={add} />
        </>
      )}
    </Screen>
  );
}
