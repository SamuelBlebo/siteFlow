import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSite } from '../site/SiteContext';
import { useAuth } from '../auth/AuthProvider';
import { logMaterial } from '../lib/db';
import { Button, Card, Choice, ErrorText, Field, H1, H2, Muted, Notice, Screen, s } from '../components/ui';
import { colors } from '../theme';

export default function MaterialsScreen() {
  const { user } = useAuth();
  const { cid, sid, materials, usage } = useSite();
  const [type, setType] = useState('usage');
  const [mid, setMid] = useState(null);
  const [qty, setQty] = useState('');
  const [supplier, setSupplier] = useState('');
  const [cost, setCost] = useState('');
  const [msg, setMsg] = useState({ kind: '', text: '' });

  if (!materials.length) {
    return <Screen><H1>Materials</H1><Muted>No materials set up for this site yet. The owner adds them from the web dashboard.</Muted></Screen>;
  }
  const material = materials.find((m) => m.id === mid) || materials[0];

  function save() {
    const q = Number(qty);
    if (!(q > 0)) return setMsg({ kind: 'err', text: 'Enter a quantity above zero.' });
    if (type === 'usage' && q > material.stock) {
      return setMsg({ kind: 'err', text: `Only ${material.stock} ${material.unit} in stock. Log the delivery first if more arrived.` });
    }
    logMaterial(cid, sid, { material, type, qty: q, cost: Number(cost) || 0, supplier: supplier.trim(), uid: user.uid });
    setMsg({ kind: 'ok', text: type === 'usage' ? `Saved: ${q} ${material.unit} of ${material.name} used.` : `Delivery saved: ${q} ${material.unit} added.` });
    setQty(''); setCost(''); setSupplier('');
  }

  return (
    <Screen>
      <H1>Materials</H1>
      <Choice options={[{ value: 'usage', label: 'Log usage' }, { value: 'delivery', label: 'Log delivery' }]} value={type} onChange={(v) => { setType(v); setMsg({}); }} />
      {msg.kind === 'err' ? <ErrorText>{msg.text}</ErrorText> : msg.text ? <Notice>{msg.text}</Notice> : null}
      <Choice label="Material" options={materials.map((m) => ({ value: m.id, label: m.name }))} value={material.id} onChange={setMid} />
      <Field label={`Quantity (${material.unit})`} value={qty} onChangeText={setQty} keyboardType="decimal-pad" hint={`${material.stock} ${material.unit} in stock`} />
      {type === 'delivery' && (
        <>
          <Field label="Supplier" value={supplier} onChangeText={setSupplier} placeholder="e.g. Ghacem depot, Tema" />
          <Field label="Total cost (GH₵)" value={cost} onChangeText={setCost} keyboardType="number-pad" />
        </>
      )}
      <Button title={type === 'usage' ? 'Save usage' : 'Save delivery'} onPress={save} />
      <H2>Stock</H2>
      <Card>
        {materials.map((m, i) => (
          <View key={m.id} style={[s.row, i === 0 && { borderTopWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink }}>{m.name}</Text>
              <Muted>Used today: {usage[m.id] || 0} {m.unit}</Muted>
            </View>
            <Text style={{ fontWeight: '700', color: colors.ink }}>{m.stock} <Text style={{ fontWeight: '400', color: colors.muted }}>left</Text></Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
