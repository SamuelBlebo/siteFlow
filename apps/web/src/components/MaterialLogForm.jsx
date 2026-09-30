import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { commit, logMaterial } from '../lib/db';

export default function MaterialLogForm({ cid, sid, materials }) {
  const { user } = useAuth();
  const [type, setType] = useState('usage');
  const [mid, setMid] = useState('');
  const [qty, setQty] = useState('');
  const [supplier, setSupplier] = useState('');
  const [cost, setCost] = useState('');
  const [msg, setMsg] = useState({ kind: '', text: '' });

  if (!materials.length) return <p className="empty">No materials set up for this site yet. The owner adds them from the site page.</p>;
  const material = materials.find((m) => m.id === mid) || materials[0];

  async function submit(e) {
    e.preventDefault();
    const q = Number(qty);
    if (!(q > 0)) return setMsg({ kind: 'err', text: 'Enter a quantity above zero.' });
    if (type === 'usage' && q > material.stock) {
      return setMsg({ kind: 'err', text: `Only ${material.stock} ${material.unit} in stock. Log the delivery first if more arrived.` });
    }
    try {
      await commit(logMaterial(cid, sid, { material, type, qty: q, cost: Number(cost) || 0, supplier: supplier.trim(), uid: user.uid }));
      setMsg({ kind: 'ok', text: type === 'usage' ? `Saved: ${q} ${material.unit} of ${material.name} used.` : `Delivery saved: ${q} ${material.unit} added.` });
      setQty(''); setCost(''); setSupplier('');
    } catch {
      setMsg({ kind: 'err', text: 'Could not save. Try again.' });
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="seg" role="group" aria-label="Type">
        <button type="button" aria-pressed={type === 'usage'} onClick={() => setType('usage')}>Log usage</button>
        <button type="button" aria-pressed={type === 'delivery'} onClick={() => setType('delivery')}>Log delivery</button>
      </div>
      {msg.text && <p className={msg.kind === 'err' ? 'err' : 'notice ok'} role="status">{msg.text}</p>}
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
          <div className="field"><label htmlFor="m-c">Total cost (GH₵)</label><input id="m-c" type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
        </div>
      )}
      <button className="btn">{type === 'usage' ? 'Save usage' : 'Save delivery'}</button>
    </form>
  );
}
