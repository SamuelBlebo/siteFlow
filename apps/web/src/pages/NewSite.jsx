import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { createSite } from '../lib/db';
import { STAGES } from '@siteflow/shared';

export default function NewSite() {
  const { cid } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', location: '', foremanName: '', foremanPhone: '', budget: '', stage: STAGES[0] });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim() || !f.location.trim()) return setErr('Enter the site name and location.');
    if (!(Number(f.budget) > 0)) return setErr('Enter the project budget in cedis.');
    const ref = await createSite(cid, { ...f, name: f.name.trim(), location: f.location.trim(), budget: Number(f.budget) });
    nav(`/sites/${ref.id}`);
  }

  return (
    <section className="wrap narrow">
      <h1>Add a site</h1>
      <form className="form card" onSubmit={submit} style={{ marginTop: 16 }}>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="field"><label htmlFor="n">Site or project name</label><input id="n" value={f.name} onChange={set('name')} placeholder="e.g. Adenta 4-bedroom house" /></div>
        <div className="field"><label htmlFor="l">Location</label><input id="l" value={f.location} onChange={set('location')} placeholder="e.g. Adenta, Accra" /></div>
        <div className="grid2">
          <div className="field"><label htmlFor="fm">Foreman name</label><input id="fm" value={f.foremanName} onChange={set('foremanName')} /></div>
          <div className="field"><label htmlFor="fp">Foreman WhatsApp number</label><input id="fp" type="tel" value={f.foremanPhone} onChange={set('foremanPhone')} placeholder="024 000 0000" /></div>
        </div>
        <div className="grid2">
          <div className="field"><label htmlFor="b">Budget (GH₵)</label><input id="b" type="number" min="0" value={f.budget} onChange={set('budget')} /></div>
          <div className="field"><label htmlFor="s">Current stage</label><select id="s" value={f.stage} onChange={set('stage')}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></div>
        </div>
        <button className="btn">Create site</button>
      </form>
    </section>
  );
}
