import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { addWorker } from '../lib/db';
import { save, savedText } from '../lib/save';
import { TRADES, validate, workerInput, workerPayInput } from '@siteflow/shared';

export default function AddWorkerForm({ cid, sid }) {
  const { user, can } = useAuth();
  const withPay = can('finance.edit');
  const [name, setName] = useState('');
  const [trade, setTrade] = useState(TRADES[0]);
  const [rate, setRate] = useState('');
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const v = validate(workerInput, { name, trade });
    if (!v.ok) return setMsg({ kind: 'err', text: v.error });
    let dailyRate = 0;
    if (withPay && rate !== '') {
      const p = validate(workerPayInput, { dailyRate: rate });
      if (!p.ok) return setMsg({ kind: 'err', text: p.error });
      dailyRate = p.data.dailyRate;
    }
    setBusy(true); setMsg({});
    try {
      const res = await save(addWorker(cid, sid, { ...v.data, dailyRate }, user.uid), `Worker ${v.data.name}`);
      setMsg({ kind: 'ok', text: savedText(res, v.data.name) });
      setName(''); setRate('');
    } catch (e2) {
      setMsg({ kind: 'err', text: e2.message }); // form keeps what was typed
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form inline" onSubmit={submit}>
      <h3>Add a worker</h3>
      {msg.text && <p className={msg.kind === 'err' ? 'err' : 'notice ok'} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
      <div className="grid3">
        <div className="field"><label htmlFor="w-n">Name</label><input id="w-n" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="w-t">Trade</label>
          <select id="w-t" value={trade} onChange={(e) => setTrade(e.target.value)}>{TRADES.map((t) => <option key={t}>{t}</option>)}</select></div>
        {withPay && <div className="field"><label htmlFor="w-r">Daily rate (GH₵)</label><input id="w-r" type="number" min="0" value={rate} onChange={(e) => setRate(e.target.value)} /></div>}
      </div>
      {!withPay && <p className="hint">The office sets the daily rate.</p>}
      <button className="btn ghost" disabled={busy}>{busy ? 'Saving…' : 'Add worker'}</button>
    </form>
  );
}
