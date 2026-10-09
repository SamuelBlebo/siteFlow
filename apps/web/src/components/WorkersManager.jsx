import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { addWorker, setWorkerActive, setWorkerRate, updateWorker } from '../lib/db';
import { save, savedText, toast } from '../lib/save';
import { TRADES, cedi, validate, workerInput, workerPayInput, currencySymbol, getLocale } from '@siteflow/shared';
import { Empty } from './States';

// The site's workers: add, fix details, set daily rates (finance), switch off (site managers)
export default function WorkersManager({ cid, sid, workers, pay, canWork }) {
  const { can } = useAuth();
  const [editing, setEditing] = useState(null);
  const [showOff, setShowOff] = useState(false);
  const active = workers.filter((w) => w.active !== false);
  const off = workers.filter((w) => w.active === false);
  const list = showOff ? workers : active;
  const canEdit = canWork || can('sites.manage');

  return (
    <>
      {canWork && <AddWorker cid={cid} sid={sid} />}
      <div className="section-head">
        <h3 className="sub">{active.length} worker{active.length === 1 ? '' : 's'} on this site</h3>
        {!!off.length && <label className="chip"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Show {off.length} switched off</label>}
      </div>
      {!list.length ? <Empty title="No workers yet." /> : (
        <ul className="list">
          {list.map((w) => (
            <li key={w.id}>
              {editing === w.id
                ? <EditWorker cid={cid} sid={sid} w={w} pay={pay} onDone={() => setEditing(null)} />
                : (
                  <div className="it">
                    <span className="grow">
                      <b>{w.name}</b> {w.active === false && <span className="pill bad">Switched off</span>}
                      <small>{w.trade}{w.phone ? `, ${w.phone}` : ''}{pay && can('finance.view') ? `, ${pay[w.id] ? `${cedi(pay[w.id].dailyRate)} a day` : 'no rate set'}` : ''}</small>
                    </span>
                    {canEdit && <button type="button" className="btn sm ghost" onClick={() => setEditing(w.id)}>Edit</button>}
                  </div>
                )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function AddWorker({ cid, sid }) {
  const { user, can } = useAuth();
  const withPay = can('finance.edit');
  const blank = { name: '', trade: TRADES[0], phone: '', rate: '' };
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    const v = validate(workerInput, f);
    if (!v.ok) return setMsg({ kind: 'err', text: v.error });
    let dailyRate = 0;
    if (withPay && f.rate !== '') {
      const p = validate(workerPayInput, { dailyRate: f.rate });
      if (!p.ok) return setMsg({ kind: 'err', text: p.error });
      dailyRate = p.data.dailyRate;
    }
    setBusy(true); setMsg({});
    try {
      const res = await save(addWorker(cid, sid, { ...v.data, dailyRate }, user.uid), `Worker ${v.data.name}`);
      setMsg({ kind: 'ok', text: savedText(res, v.data.name) });
      setF({ ...blank, trade: f.trade });
    } catch (e2) {
      setMsg({ kind: 'err', text: e2.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form inline" onSubmit={submit}>
      <h3>Add a worker</h3>
      {msg.text && <p className={msg.kind === 'err' ? 'err' : 'notice ok'} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
      <div className="grid3">
        <div className="field"><label htmlFor="aw-n">Name</label><input id="aw-n" value={f.name} onChange={set('name')} /></div>
        <div className="field"><label htmlFor="aw-t">Trade</label><select id="aw-t" value={f.trade} onChange={set('trade')}>{TRADES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label htmlFor="aw-p">Phone (optional)</label><input id="aw-p" type="tel" value={f.phone} onChange={set('phone')} placeholder={getLocale().phoneExample} /></div>
        {withPay && <div className="field"><label htmlFor="aw-r">Daily rate ({currencySymbol()})</label><input id="aw-r" type="number" min="0" value={f.rate} onChange={set('rate')} /></div>}
      </div>
      {!withPay && <p className="hint">The office sets the daily rate.</p>}
      <button type="submit" className="btn ghost" disabled={busy}>{busy ? 'Saving…' : 'Add worker'}</button>
    </form>
  );
}

function EditWorker({ cid, sid, w, pay, onDone }) {
  const { can } = useAuth();
  const [f, setF] = useState({ name: w.name, trade: w.trade, phone: w.phone || '', rate: pay?.[w.id]?.dailyRate ?? '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function run(fn) {
    setBusy(true); setErr('');
    try { await fn(); onDone(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function saveDetails(e) {
    e.preventDefault();
    const v = validate(workerInput, f);
    if (!v.ok) return setErr(v.error);
    await run(async () => {
      await save(updateWorker(cid, sid, w.id, v.data), `Worker ${v.data.name}`);
      if (can('finance.edit') && f.rate !== '' && Number(f.rate) !== pay?.[w.id]?.dailyRate) {
        const p = validate(workerPayInput, { dailyRate: f.rate });
        if (!p.ok) throw new Error(p.error);
        await save(setWorkerRate(cid, sid, w.id, p.data.dailyRate), `Daily rate for ${v.data.name}`);
      }
      toast(`${v.data.name} saved.`);
    });
  }
  const toggleActive = () => run(async () => {
    await save(setWorkerActive(cid, sid, w.id, w.active === false), `Worker ${w.name}`);
    toast(`${w.name} ${w.active === false ? 'switched back on' : 'switched off. Their attendance history is kept'}.`);
  });

  return (
    <form className="form compact" onSubmit={saveDetails}>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="grid3">
        <div className="field"><label htmlFor={`ew-n-${w.id}`}>Name</label><input id={`ew-n-${w.id}`} value={f.name} onChange={set('name')} /></div>
        <div className="field"><label htmlFor={`ew-t-${w.id}`}>Trade</label>
          <select id={`ew-t-${w.id}`} value={f.trade} onChange={set('trade')}>{[...new Set([...TRADES, f.trade])].map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label htmlFor={`ew-p-${w.id}`}>Phone</label><input id={`ew-p-${w.id}`} type="tel" value={f.phone} onChange={set('phone')} /></div>
        {can('finance.edit') && <div className="field"><label htmlFor={`ew-r-${w.id}`}>Daily rate ({currencySymbol()})</label><input id={`ew-r-${w.id}`} type="number" min="0" value={f.rate} onChange={set('rate')} /></div>}
      </div>
      <div className="actions">
        <button type="submit" className="btn" disabled={busy}>Save</button>
        <button type="button" className="btn ghost" onClick={onDone} disabled={busy}>Cancel</button>
        {can('sites.manage') && <button type="button" className="btn ghost danger" onClick={toggleActive} disabled={busy}>{w.active === false ? 'Switch back on' : 'Switch off'}</button>}
      </div>
    </form>
  );
}
