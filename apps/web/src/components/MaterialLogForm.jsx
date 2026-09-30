import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { logMaterial } from '../lib/db';
import { save, savedText } from '../lib/save';
import { materialLogInput, validate } from '@siteflow/shared';
import { Empty } from './States';

export default function MaterialLogForm({ cid, sid, materials }) {
  const { user, can } = useAuth();
  const withCost = can('finance.edit');
  const [type, setType] = useState('usage');
  const [mid, setMid] = useState('');
  const [qty, setQty] = useState('');
  const [supplier, setSupplier] = useState('');
  const [cost, setCost] = useState('');
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);

  if (!materials.length) return <Empty title="No materials set up for this site yet.">A manager adds them from the site page.</Empty>;
  const material = materials.find((m) => m.id === mid) || materials[0];

  async function submit(e) {
    e.preventDefault();
    const v = validate(materialLogInput, { materialId: material.id, type, qty, cost: withCost ? cost || 0 : 0, supplier });
    if (!v.ok) return setMsg({ kind: 'err', text: v.error });
    const q = v.data.qty;
    if (type === 'usage' && q > material.stock) {
      return setMsg({ kind: 'err', text: `Only ${material.stock} ${material.unit} in stock. Log the delivery first if more arrived.` });
    }
    setBusy(true); setMsg({});
    try {
      const res = await save(logMaterial(cid, sid, { material, type, qty: q, cost: v.data.cost, supplier: v.data.supplier, uid: user.uid }),
        `${material.name} ${type}`);
      setMsg({ kind: 'ok', text: savedText(res, type === 'usage' ? `${q} ${material.unit} of ${material.name} used` : `Delivery of ${q} ${material.unit}`) });
      setQty(''); setCost(''); setSupplier('');
    } catch (e2) {
      setMsg({ kind: 'err', text: e2.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="seg" role="group" aria-label="Type">
        <button type="button" aria-pressed={type === 'usage'} onClick={() => setType('usage')}>Log usage</button>
        <button type="button" aria-pressed={type === 'delivery'} onClick={() => setType('delivery')}>Log delivery</button>
      </div>
      {msg.text && <p className={msg.kind === 'err' ? 'err' : 'notice ok'} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
      <div className="grid2">
        <div className="field"><label htmlFor="m-sel">Material</label>
          <select id="m-sel" value={material.id} onChange={(e) => setMid(e.target.value)}>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.stock} {m.unit} left)</option>)}
          </select></div>
        <div className="field"><label htmlFor="m-q">Quantity ({material.unit})</label>
          <input id="m-q" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
      </div>
      {type === 'delivery' && (
        <div className="grid2">
          <div className="field"><label htmlFor="m-s">Supplier</label><input id="m-s" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Ghacem depot, Tema" /></div>
          {withCost && <div className="field"><label htmlFor="m-c">Total cost (GH₵)</label><input id="m-c" type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} /></div>}
        </div>
      )}
      <button className="btn" disabled={busy}>{busy ? 'Saving…' : type === 'usage' ? 'Save usage' : 'Save delivery'}</button>
    </form>
  );
}
