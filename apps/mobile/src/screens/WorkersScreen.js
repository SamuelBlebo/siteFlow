import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSite } from '../site/SiteContext';
import { useAuth } from '../auth/AuthProvider';
import { addWorker, attendanceRangeQuery, attendanceRef, exists, markAttendance, toList, updateWorker } from '../lib/db';
import {
  ATTENDANCE_LABELS, ATTENDANCE_STATUSES, TRADES, cedi, countByStatus, dailyWages, markAllPresent, prettyDate, todayKey, validate,
  workerInput, workerPayInput,
} from '@siteflow/shared';
import { Button, Card, Choice, ErrorText, ErrorView, Field, H1, H2, Muted, Notice, Screen, s } from '../components/ui';
import { colors } from '../theme';

const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return todayKey(d); };
const weekAgo = () => { const d = new Date(); d.setDate(d.getDate() - 6); return todayKey(d); };
const STATUS_COLOR = { present: colors.ok, late: colors.warn, absent: colors.bad, leave: colors.steel };

export default function WorkersScreen() {
  const { user, can } = useAuth();
  const { cid, sid, workers, marks: todayMarks, pay, error, canWork: work } = useSite();
  const [date, setDate] = useState(todayKey());
  const [otherMarks, setOtherMarks] = useState({});
  const [editing, setEditing] = useState(null);
  const isToday = date === todayKey();

  // Today comes from the site context; another day is loaded here
  useEffect(() => {
    if (isToday) return;
    return attendanceRef(cid, sid, date).onSnapshot((d) => setOtherMarks(exists(d) ? d.data().marks || {} : {}), (e) => console.warn('Could not load attendance', e));
  }, [cid, sid, date, isToday]);
  const marks = isToday ? todayMarks : otherMarks;
  const c = countByStatus(marks);
  const unmarked = workers.filter((w) => !marks[w.id]);

  const mark = (w, st) => markAttendance(cid, sid, { marks: { [w.id]: st }, label: `Attendance for ${w.name}`, uid: user.uid, date });
  const markRest = () => markAttendance(cid, sid, { marks: markAllPresent(workers, marks), label: 'Attendance', uid: user.uid, date });

  return (
    <Screen>
      <H1>Attendance</H1>
      {error ? <ErrorView error={error} what="some site data" /> : null}
      <Choice options={[{ value: todayKey(), label: 'Today' }, { value: yesterday(), label: 'Yesterday' }]} value={date} onChange={setDate} />
      <Muted style={{ marginBottom: 12 }}>{prettyDate(date)}. {work ? 'Tap how each worker came.' : 'Who came to site.'}</Muted>

      {work && unmarked.length > 0 && (
        <Button title={`Mark the other ${unmarked.length} present`} onPress={markRest} style={{ marginBottom: 12 }} />
      )}

      <Card>
        {!workers.length ? <Text style={{ padding: 14, color: colors.muted }}>No workers yet.{work ? ' Add them below.' : ''}</Text> :
          workers.map((w, i) => (
            <View key={w.id} style={[s.row, i === 0 && { borderTopWidth: 0 }, { flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
              <Pressable onPress={() => work && setEditing(editing === w.id ? null : w.id)} accessibilityRole={work ? 'button' : undefined}>
                <Text style={{ fontWeight: '600', color: colors.ink, fontSize: 16 }}>{w.name}</Text>
                <Muted>{w.trade}{w.phone ? `, ${w.phone}` : ''}{pay ? `, ${pay[w.id] ? `${cedi(pay[w.id].dailyRate)} a day` : 'no rate set'}` : ''}</Muted>
              </Pressable>
              {editing === w.id ? (
                <EditWorker cid={cid} sid={sid} w={w} onDone={() => setEditing(null)} />
              ) : (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {ATTENDANCE_STATUSES.map((st) => {
                    const on = marks[w.id] === st;
                    return (
                      <Pressable key={st} disabled={!work} onPress={() => !on && mark(w, st)} accessibilityRole="button"
                        accessibilityState={{ selected: on, disabled: !work }} accessibilityLabel={`${w.name} ${ATTENDANCE_LABELS[st]}`}
                        style={{
                          flex: 1, minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1,
                          borderColor: on ? STATUS_COLOR[st] : colors.line, backgroundColor: on ? STATUS_COLOR[st] : colors.surface,
                          opacity: !work && !on ? 0.5 : 1,
                        }}>
                        <Text style={{ color: on ? '#fff' : colors.ink, fontWeight: '600' }}>{ATTENDANCE_LABELS[st]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          ))}
      </Card>
      <Card style={{ marginTop: 12, padding: 14 }}>
        <Text style={{ color: colors.ink }}>{c.present} present, {c.late} late, {c.absent} absent, {c.leave} on leave{unmarked.length ? `, ${unmarked.length} not marked` : ''}</Text>
        {pay ? <Text style={{ fontWeight: '700', color: colors.ink, marginTop: 4 }}>Wages: {cedi(dailyWages(workers, pay, marks))}</Text> : null}
      </Card>

      {work && <AddWorker cid={cid} sid={sid} uid={user.uid} withPay={can('finance.edit')} />}
      <LastSevenDays cid={cid} sid={sid} />
    </Screen>
  );
}

function AddWorker({ cid, sid, uid, withPay }) {
  const [name, setName] = useState('');
  const [trade, setTrade] = useState(TRADES[0]);
  const [phone, setPhone] = useState('');
  const [rate, setRate] = useState('');
  const [msg, setMsg] = useState({});

  function add() {
    const v = validate(workerInput, { name, trade, phone });
    if (!v.ok) return setMsg({ kind: 'err', text: v.error });
    let dailyRate = 0;
    if (withPay && rate !== '') {
      const p = validate(workerPayInput, { dailyRate: rate });
      if (!p.ok) return setMsg({ kind: 'err', text: p.error });
      dailyRate = p.data.dailyRate;
    }
    addWorker(cid, sid, { ...v.data, dailyRate, uid });
    setMsg({ kind: 'ok', text: `${v.data.name} added.` });
    setName(''); setPhone(''); setRate('');
  }

  return (
    <>
      <H2>Add a worker</H2>
      {msg.kind === 'err' ? <ErrorText>{msg.text}</ErrorText> : msg.text ? <Notice>{msg.text}</Notice> : null}
      <Field label="Name" value={name} onChangeText={setName} />
      <Choice label="Trade" options={TRADES} value={trade} onChange={setTrade} />
      <Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="024 000 0000" />
      {withPay
        ? <Field label="Daily rate (GH₵)" value={rate} onChangeText={setRate} keyboardType="number-pad" />
        : <Muted style={{ marginBottom: 12 }}>The office sets the daily rate.</Muted>}
      <Button title="Add worker" variant="ghost" onPress={add} />
    </>
  );
}

function EditWorker({ cid, sid, w, onDone }) {
  const [name, setName] = useState(w.name);
  const [trade, setTrade] = useState(w.trade);
  const [phone, setPhone] = useState(w.phone || '');
  const [err, setErr] = useState('');
  function saveIt() {
    const v = validate(workerInput, { name, trade, phone });
    if (!v.ok) return setErr(v.error);
    updateWorker(cid, sid, { id: w.id, ...v.data });
    onDone();
  }
  return (
    <View>
      <ErrorText>{err}</ErrorText>
      <Field label="Name" value={name} onChangeText={setName} />
      <Choice label="Trade" options={[...new Set([...TRADES, trade])]} value={trade} onChange={setTrade} />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Save" onPress={saveIt} style={{ flex: 1 }} />
        <Button title="Cancel" variant="ghost" onPress={onDone} style={{ flex: 1 }} />
      </View>
      <Muted style={{ marginTop: 6, fontSize: 13 }}>A manager can switch a worker off from the web.</Muted>
    </View>
  );
}

// Counts for the last seven days, newest first
function LastSevenDays({ cid, sid }) {
  const [days, setDays] = useState([]);
  useEffect(() => attendanceRangeQuery(cid, sid, weekAgo(), todayKey()).onSnapshot((q) => setDays(toList(q)), () => {}), [cid, sid]);
  if (!days.length) return null;
  return (
    <>
      <H2>Last seven days</H2>
      <Card>
        {days.map((d, i) => {
          const c = countByStatus(d.marks);
          return (
            <View key={d.date} style={[s.row, i === 0 && { borderTopWidth: 0 }]}>
              <Text style={{ color: colors.ink, width: 110, fontWeight: '600' }}>{prettyDate(d.date)}</Text>
              <Muted style={{ flex: 1 }}>{c.present + c.late} came{c.late ? ` (${c.late} late)` : ''}, {c.absent} absent{c.leave ? `, ${c.leave} leave` : ''}</Muted>
            </View>
          );
        })}
      </Card>
    </>
  );
}
