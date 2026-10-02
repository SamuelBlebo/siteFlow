import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { addMaterial, setMaterialActive, stockCount, updateMaterial } from '../lib/db';
import { save, savedText, toast } from '../lib/save';
import { UNITS, countDifference, materialEditInput, materialInput, stockCountInput, validate } from '@siteflow/shared';
import { Empty } from './States';

// Site managers: add materials, change their details, count stock, archive
export default function MaterialSetup({ cid, sid, materials, canCount }) {
  const [open, setOpen] = useState(null); // { id, mode: 'edit' | 'count' }
  return (
    <>
      <AddMaterial cid={cid} sid={sid} />
      <h3 className="sub">Materials on this site</h3>
      {!materials.length ? <Empty title="No materials yet." /> : (
        <ul className="list">
          {materials.map((m) => (
            <li key={m.id}>
              <div className="it">
                <span className="grow">
                  <b>{m.name}</b> {m.active === false && <span className="pill bad">Archived</span>}
                  <small>{m.stock} {m.unit} in stock. Reorder below {m.reorderLevel || '–'}, usual use {m.avgDaily || '–'} a day.</small>
                </span>
                {m.active !== false && canCount && <button type="button" className="btn sm ghost" onClick={() => setOpen(open?.id === m.id && open.mode === 'count' ? null : { id: m.id, mode: 'count' })}>Count stock</button>}
                <button type="button" className="btn sm ghost" onClick={() => setOpen(open?.id === m.id && open.mode === 'edit' ? null : { id: m.id, mode: 'edit' })}>Edit</button>
              </div>
              {open?.id === m.id && open.mode === 'edit' && <EditMaterial cid={cid} sid={sid} m={m} onDone={() => setOpen(null)} />}
              {open?.id === m.id && open.mode === 'count' && <CountStock cid={cid} sid={sid} m={m} onDone={() => setOpen(null)} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const fields = (f, set, prefix) => (
  <>
    <div className="field"><label htmlFor={`${prefix}-n`}>Name</label><input id={`${prefix}-n`} value={f.name} onChange={set('name')} placeholder="e.g. Cement (50kg)" /></div>
    <div className="field"><label htmlFor={`${prefix}-u`}>Unit</label>
      <select id={`${prefix}-u`} value={f.unit} onChange={set('unit')}>{[...new Set([...UNITS, f.unit])].map((u) => <option key={u}>{u}</option>)}</select></div>
    <div className="field"><label htmlFor={`${prefix}-r`}>Reorder when below</label><input id={`${prefix}-r`} type="number" min="0" value={f.reorderLevel} onChange={set('reorderLevel')} /></div>
    <div className="field"><label htmlFor={`${prefix}-a`}>Usual daily use</label><input id={`${prefix}-a`} type="number" min="0" value={f.avgDaily} onChange={set('avgDaily')} />
      <p className="hint">Used to flag unusually high use.</p></div>
  </>
);

function AddMaterial({ cid, sid }) {
  const blank = { name: '', unit: UNITS[0], stock: '', reorderLevel: '', avgDaily: '' };
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    const v = validate(materialInput, { ...f, stock: f.stock || 0, reorderLevel: f.reorderLevel || 0, avgDaily: f.avgDaily || 0 });
    if (!v.ok) return setMsg({ kind: 'err', text: v.error });
    setBusy(true); setMsg({});
    try {
      const res = await save(addMaterial(cid, sid, v.data), `Material ${v.data.name}`);
      setMsg({ kind: 'ok', text: savedText(res, v.data.name) });
      setF(blank);
    } catch (e2) {
      setMsg({ kind: 'err', text: e2.message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form inline" onSubmit={submit}>
      <h3>Add a material</h3>
      {msg.text && <p className={msg.kind === 'err' ? 'err' : 'notice ok'} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
      <div className="grid3">
        {fields(f, set, 'am')}
        <div className="field"><label htmlFor="am-s">Opening stock</label><input id="am-s" type="number" min="0" value={f.stock} onChange={set('stock')} /></div>
      </div>
      <button type="submit" className="btn ghost" disabled={busy}>{busy ? 'Saving…' : 'Add material'}</button>
    </form>
  );
}

function EditMaterial({ cid, sid, m, onDone }) {
  const [f, setF] = useState({ name: m.name, unit: m.unit, reorderLevel: m.reorderLevel ?? '', avgDaily: m.avgDaily ?? '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function run(fn) {
    setBusy(true); setErr('');
    try { await fn(); onDone(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const submit = (e) => {
    e.preventDefault();
    const v = validate(materialEditInput, { ...f, reorderLevel: f.reorderLevel || 0, avgDaily: f.avgDaily || 0 });
    if (!v.ok) return setErr(v.error);
    run(async () => { await save(updateMaterial(cid, sid, m.id, v.data), `Material ${v.data.name}`); toast(`${v.data.name} saved.`); });
  };
  const archive = () => run(async () => {
    await save(setMaterialActive(cid, sid, m.id, m.active === false), `Material ${m.name}`);
    toast(m.active === false ? `${m.name} is back in use.` : `${m.name} archived. Its history is kept.`);
  });
  return (
    <form className="form compact" onSubmit={submit}>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="grid3">{fields(f, set, `em-${m.id}`)}</div>
      <p className="hint">To change the quantity in stock, use Count stock.</p>
      <div className="actions">
        <button type="submit" className="btn" disabled={busy}>Save</button>
        <button type="button" className="btn ghost" onClick={onDone} disabled={busy}>Cancel</button>
        <button type="button" className="btn ghost danger" onClick={archive} disabled={busy}>{m.active === false ? 'Bring back' : 'Archive'}</button>
      </div>
    </form>
  );
}

function CountStock({ cid, sid, m, onDone }) {
  const { user, profile } = useAuth();
  const [f, setF] = useState({ counted: '', note: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const diff = f.counted === '' ? null : countDifference(m.stock, Number(f.counted));
  async function submit(e) {
    e.preventDefault();
    const v = validate(stockCountInput, f);
    if (!v.ok) return setErr(v.error);
    setBusy(true); setErr('');
    try {
      const write = stockCount(cid, sid, { material: m, counted: v.data.counted, note: v.data.note, uid: user.uid, name: profile.name });
      if (!write) toast(`The count matches the records: ${m.stock} ${m.unit}. Nothing to change.`);
      else { await save(write, `Stock count for ${m.name}`); toast(`${m.name} set to ${v.data.counted} ${m.unit}.`); }
      onDone();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form compact" onSubmit={submit}>
      {err && <p className="err" role="alert">{err}</p>}
      <p>Records show <b>{m.stock} {m.unit}</b>. Count what is on site and enter it here.</p>
      <div className="grid2">
        <div className="field"><label htmlFor={`cs-c-${m.id}`}>Counted ({m.unit})</label><input id={`cs-c-${m.id}`} type="number" min="0" step="any" value={f.counted} onChange={(e) => setF({ ...f, counted: e.target.value })} />
          {diff != null && diff !== 0 && <p className="hint">{diff > 0 ? `${diff} ${m.unit} more` : `${-diff} ${m.unit} fewer`} than the records.</p>}</div>
        <div className="field"><label htmlFor={`cs-n-${m.id}`}>Reason</label><input id={`cs-n-${m.id}`} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Monthly count, bags damaged by rain" /></div>
      </div>
      <div className="actions">
        <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save count'}</button>
        <button type="button" className="btn ghost" onClick={onDone} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}
