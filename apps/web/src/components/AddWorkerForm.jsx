import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { addWorker, commit } from '../lib/db';
import { TRADES } from '@siteflow/shared';

export default function AddWorkerForm({ cid, sid }) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [trade, setTrade] = useState(TRADES[0]);
  const [rate, setRate] = useState('');
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return setErr('Enter the worker’s name.');
    if (!(Number(rate) > 0)) return setErr('Enter a daily rate above zero.');
    setErr('');
    await commit(addWorker(cid, sid, { name: name.trim(), trade, dailyRate: Number(rate) }, user.uid));
    setName(''); setRate('');
  }

  return (
    <form className="form inline" onSubmit={submit}>
      <h3>Add a worker</h3>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="grid3">
        <div className="field"><label htmlFor="w-n">Name</label><input id="w-n" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="w-t">Trade</label>
          <select id="w-t" value={trade} onChange={(e) => setTrade(e.target.value)}>{TRADES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label htmlFor="w-r">Daily rate (GH₵)</label><input id="w-r" type="number" min="0" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
      </div>
      <button className="btn ghost">Add worker</button>
    </form>
  );
}
