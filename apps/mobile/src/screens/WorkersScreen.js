import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useSite } from '../site/SiteContext';
import { useAuth } from '../auth/AuthProvider';
import { addWorker, saveAttendance } from '../lib/db';
import { cedi } from '@siteflow/shared';
import { TRADES } from '@siteflow/shared';
import { Button, Card, Choice, ErrorText, Field, H1, H2, Muted, Screen, s } from '../components/ui';
import { colors } from '../theme';

export default function WorkersScreen() {
  const { user } = useAuth();
  const { cid, sid, workers, present, presentCount } = useSite();
  const [name, setName] = useState('');
  const [trade, setTrade] = useState(TRADES[0]);
  const [rate, setRate] = useState('');
  const [err, setErr] = useState('');

  const wages = workers.filter((w) => present[w.id]).reduce((sum, w) => sum + (w.dailyRate || 0), 0);
  const toggle = (w) => saveAttendance(cid, sid, { present: { ...present, [w.id]: !present[w.id] }, workers, uid: user.uid });

  function add() {
    if (!name.trim()) return setErr('Enter the worker’s name.');
    if (!(Number(rate) > 0)) return setErr('Enter a daily rate above zero.');
    setErr('');
    addWorker(cid, sid, { name: name.trim(), trade, dailyRate: Number(rate) }, user.uid);
    setName(''); setRate('');
  }

  return (
    <Screen>
      <H1>Attendance</H1>
      <Muted style={{ marginBottom: 12 }}>Tick everyone who came to site today.</Muted>
      <Card>
        {!workers.length ? <Text style={{ padding: 14, color: colors.muted }}>No workers yet. Add them below.</Text> :
          workers.map((w, i) => (
            <View key={w.id} style={[s.row, i === 0 && { borderTopWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: colors.ink }}>{w.name}</Text>
                <Muted>{w.trade}, {cedi(w.dailyRate)} a day</Muted>
              </View>
              <Switch value={!!present[w.id]} onValueChange={() => toggle(w)} trackColor={{ true: colors.ok }} accessibilityLabel={`${w.name} present`} />
            </View>
          ))}
      </Card>
      <Card style={{ marginTop: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.ink }}>{presentCount} present</Text>
        <Text style={{ fontWeight: '700', color: colors.ink }}>Wages today: {cedi(wages)}</Text>
      </Card>

      <H2>Add a worker</H2>
      <ErrorText>{err}</ErrorText>
      <Field label="Name" value={name} onChangeText={setName} />
      <Choice label="Trade" options={TRADES} value={trade} onChange={setTrade} />
      <Field label="Daily rate (GH₵)" value={rate} onChangeText={setRate} keyboardType="number-pad" />
      <Button title="Add worker" variant="ghost" onPress={add} />
    </Screen>
  );
}
