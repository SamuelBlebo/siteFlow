import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useSite } from '../site/SiteContext';
import { useAuth } from '../auth/AuthProvider';
import { logMaterial } from '../lib/db';
import { MATERIAL_LOG_LABELS, daysLeft, materialLogInput, materialStatus, validate } from '@siteflow/shared';
import { Button, Card, ErrorText, ErrorView, Field, H1, H2, Muted, Notice, Pill, Screen, s } from '../components/ui';
import { colors } from '../theme';

const USED_FOR = ['Blockwork', 'Concrete', 'Plastering', 'Foundation', 'Slab', 'Columns', 'Roofing', 'Flooring'];

export default function MaterialsScreen() {
  const { user, profile, can } = useAuth();
  const { cid, sid, materials, usage, logs, error, canWork: work } = useSite();
  const withCost = can('finance.edit');
  const blank = { qty: '', supplier: '', ref: '', cost: '', note: '' };
  const [type, setType] = useState('usage');
  const [mid, setMid] = useState(null);
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState({});
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  if (!materials.length) {
    return <Screen><H1>Materials</H1>{error ? <ErrorView error={error} what="materials" /> : null}<Muted>No materials set up for this site yet. A project manager adds them on the web.</Muted></Screen>;
  }
  const material = materials.find((m) => m.id === mid) || materials[0];
  const todays = [...logs].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  function record() {
    const v = validate(materialLogInput, { ...f, materialId: material.id, type, cost: withCost && type === 'delivery' ? f.cost || 0 : 0 });
    if (!v.ok) return setMsg({ kind: 'err', text: v.error });
    const q = v.data.qty;
    const go = () => {
      logMaterial(cid, sid, { material: { id: material.id, name: material.name, unit: material.unit }, ...v.data, uid: user.uid, name: profile.name });
      setMsg({ kind: 'ok', text: type === 'usage' ? `Saved: ${q} ${material.unit} of ${material.name} used.` : `Saved: ${q} ${material.unit} of ${material.name} received.` });
      setF(blank);
    };
    if (type === 'usage' && q > material.stock) {
      return Alert.alert('More than the records show', `Records show ${material.stock} ${material.unit} of ${material.name}. A delivery may not have been entered yet. Save ${q} used anyway?`, [
        { text: 'Go back', style: 'cancel' },
        { text: 'Save anyway', onPress: go },
      ]);
    }
    go();
  }

  return (
    <Screen>
      <H1>Materials</H1>
      {error ? <ErrorView error={error} what="some site data" /> : null}
      {work && (
        <>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {[['usage', 'Used'], ['delivery', 'Received']].map(([k, l]) => (
              <Pressable key={k} onPress={() => { setType(k); setMsg({}); }} accessibilityRole="button" accessibilityState={{ selected: type === k }}
                style={{ flex: 1, minHeight: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1,
                  borderColor: type === k ? colors.steel : colors.line, backgroundColor: type === k ? colors.steel : colors.surface }}>
                <Text style={{ color: type === k ? '#fff' : colors.ink, fontWeight: '700', fontSize: 16 }}>{l}</Text>
              </Pressable>
            ))}
          </View>
          {msg.kind === 'err' ? <ErrorText>{msg.text}</ErrorText> : msg.text ? <Notice>{msg.text}</Notice> : null}

          <Text style={s.label}>Material</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {materials.map((m) => {
              const on = m.id === material.id;
              return (
                <Pressable key={m.id} onPress={() => setMid(m.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={[s.chip, { marginRight: 0, minHeight: 44, justifyContent: 'center' }, on && { backgroundColor: colors.steel, borderColor: colors.steel }]}>
                  <Text style={{ color: on ? '#fff' : colors.ink, fontWeight: '600' }}>{m.name}</Text>
                  <Text style={{ color: on ? '#fff' : colors.muted, fontSize: 12 }}>{m.stock} {m.unit}</Text>
                </Pressable>
              );
            })}
          </View>

          <Field label={`Quantity (${material.unit})`} value={f.qty} onChangeText={set('qty')} keyboardType="decimal-pad" hint={`${material.stock} ${material.unit} in stock`} />
          {type === 'usage' ? (
            <>
              <Field label="Used for (optional)" value={f.note} onChangeText={set('note')} placeholder="e.g. Column casting" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -6, marginBottom: 14 }}>
                {USED_FOR.map((p) => (
                  <Pressable key={p} onPress={() => set('note')(p)} accessibilityRole="button" style={[s.chip, { marginRight: 0, paddingVertical: 6 }]}>
                    <Text style={{ color: colors.ink, fontSize: 13 }}>{p}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <>
              <Field label="Supplier" value={f.supplier} onChangeText={set('supplier')} placeholder="e.g. Ghacem depot, Tema" />
              <Field label="Waybill or invoice no. (optional)" value={f.ref} onChangeText={set('ref')} />
              {withCost && <Field label="Total cost (GH₵)" value={f.cost} onChangeText={set('cost')} keyboardType="number-pad" />}
            </>
          )}
          <Button title={type === 'usage' ? 'Save usage' : 'Save delivery'} onPress={record} />
        </>
      )}

      <H2>Stock</H2>
      <Card>
        {materials.map((m, i) => {
          const st = materialStatus(m, usage[m.id]);
          const left = daysLeft(m.stock, m.avgDaily);
          return (
            <View key={m.id} style={[s.row, i === 0 && { borderTopWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{m.name}</Text>
                <Muted>Used today: {usage[m.id] || 0} {m.unit}{left != null ? `. About ${left} day${left === 1 ? '' : 's'} left` : ''}</Muted>
              </View>
              <Text style={{ fontWeight: '700', color: st.negative ? colors.bad : colors.ink }}>{m.stock} <Text style={{ fontWeight: '400', color: colors.muted }}>{m.unit}</Text></Text>
              {st.negative ? <Pill kind="bad">Count needed</Pill> : st.low ? <Pill kind="warn">Low</Pill> : null}
            </View>
          );
        })}
      </Card>

      {!!todays.length && (
        <>
          <H2>Today's entries</H2>
          <Card>
            {todays.map((l, i) => (
              <View key={l.id} style={[s.row, i === 0 && { borderTopWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink }}>{MATERIAL_LOG_LABELS[l.type]}: {Math.abs(l.qty)} {l.unit} {l.materialName}</Text>
                  <Muted>{[l.note, l.supplier, l.createdByName].filter(Boolean).join(' · ')}</Muted>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
