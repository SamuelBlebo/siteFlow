import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { logMaterial } from '../lib/db';
import { save, savedText } from '../lib/save';
import { materialLogInput, validate } from '@siteflow/shared';
import { Empty } from './States';

// Record what was used or received. Deliveries take supplier, waybill and (finance roles) cost.
export default function MaterialLogForm({ cid, sid, materials }) {
  const { user, profile, can } = useAuth();
  const withCost = can('finance.edit');
  const blank = { qty: '', supplier: '', ref: '', cost: '', note: '' };
  const [type, setType] = useState('usage');
  const [mid, setMid] = useState('');
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  if (!materials.length) return <Empty title="No materials set up for this site yet.">A project manager adds them under Set up.</Empty>;
  const material = materials.find((m) => m.id === mid) || materials[0];

  async function submit(e) {
    e.preventDefault();
    const v = validate(materialLogInput, { ...f, materialId: material.id, type, cost: withCost && type === 'delivery' ? f.cost || 0 : 0 });
    if (!v.ok) return setMsg({ kind: 'err', text: v.error });
    const q = v.data.qty;
    if (type === 'usage' && q > material.stock
      && !window.confirm(`Records show only ${material.stock} ${material.unit} of ${material.name}. Record ${q} used anyway? A delivery may not have been entered yet.`)) return;
    setBusy(true); setMsg({});
    try {
      const res = await save(logMaterial(cid, sid, { material, ...v.data, uid: user.uid, name: profile.name }), `${material.name} ${type}`);
      setMsg({ kind: 'ok', text: savedText(res, type === 'usage' ? `${q} ${material.unit} of ${material.name} used` : `Delivery of ${q} ${material.unit} ${material.name}`) });
      setF(blank);
    } catch (e2) {
      setMsg({ kind: 'err', text: e2.message }); // form keeps what was typed
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="seg" role="group" aria-label="Entry">
        <button type="button" aria-pressed={type === 'usage'} onClick={() => setType('usage')}>Used</button>
        <button type="button" aria-pressed={type === 'delivery'} onClick={() => setType('delivery')}>Received</button>
      </div>
      {msg.text && <p className={msg.kind === 'err' ? 'err' : 'notice ok'} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
      <div className="grid2">
        <div className="field"><label htmlFor="m-sel">Material</label>
          <select id="m-sel" value={material.id} onChange={(e) => setMid(e.target.value)}>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.stock} {m.unit} in stock)</option>)}
          </select></div>
        <div className="field"><label htmlFor="m-q">Quantity ({material.unit})</label>
          <input id="m-q" type="number" min="0" step="any" value={f.qty} onChange={set('qty')} /></div>
      </div>
      {type === 'delivery' ? (
        <div className="grid3">
          <div className="field"><label htmlFor="m-s">Supplier</label><input id="m-s" value={f.supplier} onChange={set('supplier')} placeholder="e.g. Ghacem depot, Tema" /></div>
          <div className="field"><label htmlFor="m-r">Waybill or invoice no.</label><input id="m-r" value={f.ref} onChange={set('ref')} /></div>
          {withCost && <div className="field"><label htmlFor="m-c">Total cost (GH₵)</label><input id="m-c" type="number" min="0" value={f.cost} onChange={set('cost')} /></div>}
        </div>
      ) : (
        <div className="field"><label htmlFor="m-n">Used for (optional)</label><input id="m-n" value={f.note} onChange={set('note')} placeholder="e.g. Column casting, first floor" /></div>
      )}
      <button className="btn" disabled={busy}>{busy ? 'Saving…' : type === 'usage' ? 'Save usage' : 'Save delivery'}</button>
    </form>
  );
}
