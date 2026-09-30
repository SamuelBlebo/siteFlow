import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useQuery, useSiteData } from '../lib/hooks';
import { addExpense, addMaterial, commit, expensesQuery, reportsQuery, siteDoc } from '../lib/db';
import { EXPENSE_CATEGORIES, UNITS } from '@siteflow/shared';
import { cedi, pct } from '@siteflow/shared';
import { prettyDate } from '@siteflow/shared';
import Tabs from '../components/Tabs';
import ReportCard from '../components/ReportCard';
import MaterialsTable from '../components/MaterialsTable';
import MaterialLogForm from '../components/MaterialLogForm';
import AttendanceList from '../components/AttendanceList';
import AddWorkerForm from '../components/AddWorkerForm';

export default function SiteDetail() {
  const { sid } = useParams();
  const { cid } = useAuth();
  const [tab, setTab] = useState('reports');
  const { data: site, loading } = useDoc(() => cid && siteDoc(cid, sid), [cid, sid]);
  const data = useSiteData(cid, sid);

  if (loading) return <p className="pad">Loading…</p>;
  if (!site) return <p className="pad">This site doesn't exist or you don't have access. <Link to="/">Back to dashboard</Link></p>;

  return (
    <section className="wrap">
      <Link to="/" className="btn sm ghost back">All sites</Link>
      <div className="row-between">
        <h1>{site.name}</h1>
        <Link to={`/work/${sid}`} className="btn ghost">Open site workspace</Link>
      </div>
      <div className="meta"><span>{site.location}</span><span>Foreman: {site.foremanName || '–'}</span><span>Stage: {site.stage}</span></div>
      <div className="prog"><div className="meter"><span style={{ width: `${site.progress || 0}%` }} /></div><b>{site.progress || 0}% complete</b></div>
      <Tabs value={tab} onChange={setTab} tabs={[['reports', 'Daily reports'], ['materials', 'Materials'], ['labour', 'Labour'], ['budget', 'Budget']]} />
      {tab === 'reports' && <ReportsTab cid={cid} sid={sid} />}
      {tab === 'materials' && (
        <>
          <MaterialsTable materials={data.materials} usage={data.usage} />
          <h3 className="sub">Log usage or a delivery</h3>
          <MaterialLogForm cid={cid} sid={sid} materials={data.materials} />
          <AddMaterialForm cid={cid} sid={sid} />
        </>
      )}
      {tab === 'labour' && (
        <>
          <AttendanceList cid={cid} sid={sid} workers={data.workers} attendance={data.attendance} />
          <AddWorkerForm cid={cid} sid={sid} />
        </>
      )}
      {tab === 'budget' && <BudgetTab cid={cid} sid={sid} site={site} />}
    </section>
  );
}

function ReportsTab({ cid, sid }) {
  const { data, loading } = useQuery(() => reportsQuery(cid, sid), [cid, sid]);
  if (loading) return <p>Loading reports…</p>;
  if (!data.length) return <p className="empty">No reports yet. They appear here as soon as the site team sends one.</p>;
  return data.map((r) => <ReportCard key={r.id} r={r} />);
}

function AddMaterialForm({ cid, sid }) {
  const [f, setF] = useState({ name: '', unit: UNITS[0], stock: '', reorderLevel: '', avgDaily: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) return setErr('Enter the material name.');
    setErr('');
    await commit(addMaterial(cid, sid, {
      name: f.name.trim(), unit: f.unit, stock: Number(f.stock) || 0,
      reorderLevel: Number(f.reorderLevel) || 0, avgDaily: Number(f.avgDaily) || 0,
    }));
    setF({ name: '', unit: UNITS[0], stock: '', reorderLevel: '', avgDaily: '' });
  }
  return (
    <form className="form inline" onSubmit={submit}>
      <h3>Add a material</h3>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="grid3">
        <div className="field"><label htmlFor="am-n">Name</label><input id="am-n" value={f.name} onChange={set('name')} placeholder="e.g. Cement (50kg)" /></div>
        <div className="field"><label htmlFor="am-u">Unit</label><select id="am-u" value={f.unit} onChange={set('unit')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></div>
        <div className="field"><label htmlFor="am-s">Opening stock</label><input id="am-s" type="number" min="0" value={f.stock} onChange={set('stock')} /></div>
        <div className="field"><label htmlFor="am-r">Reorder when below</label><input id="am-r" type="number" min="0" value={f.reorderLevel} onChange={set('reorderLevel')} /></div>
        <div className="field"><label htmlFor="am-a">Usual daily use</label><input id="am-a" type="number" min="0" value={f.avgDaily} onChange={set('avgDaily')} />
          <p className="hint">Used to flag unusually high use.</p></div>
      </div>
      <button className="btn ghost">Add material</button>
    </form>
  );
}

function BudgetTab({ cid, sid, site }) {
  const { user } = useAuth();
  const { data: expenses } = useQuery(() => expensesQuery(cid, sid), [cid, sid]);
  const [f, setF] = useState({ category: EXPENSE_CATEGORIES[0], note: '', amount: '' });
  const [err, setErr] = useState('');
  const p = pct(site.spent, site.budget);
  async function submit(e) {
    e.preventDefault();
    if (!(Number(f.amount) > 0)) return setErr('Enter an amount above zero.');
    setErr('');
    await commit(addExpense(cid, sid, { ...f, note: f.note.trim(), amount: Number(f.amount), uid: user.uid }));
    setF({ ...f, note: '', amount: '' });
  }
  return (
    <>
      <dl className="cols">
        <div><dt>Budget</dt><dd>{cedi(site.budget)}</dd></div>
        <div><dt>Spent</dt><dd>{cedi(site.spent)}</dd></div>
        <div><dt>Remaining</dt><dd>{cedi(site.budget - (site.spent || 0))}</dd></div>
        <div><dt>Work done</dt><dd>{site.progress || 0}%</dd></div>
      </dl>
      {p >= 90 && <p className="err">{p}% of the budget is spent but only {site.progress || 0}% of the work is done.</p>}
      <form className="form inline" onSubmit={submit}>
        <h3>Record an expense</h3>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="grid3">
          <div className="field"><label htmlFor="x-c">Category</label><select id="x-c" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label htmlFor="x-n">Details</label><input id="x-n" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
          <div className="field"><label htmlFor="x-a">Amount (GH₵)</label><input id="x-a" type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
        </div>
        <button className="btn ghost">Save expense</button>
      </form>
      <h3 className="sub">Recent expenses</h3>
      {!expenses.length ? <p className="empty">No expenses recorded yet.</p> : (
        <div className="scroll"><table>
          <thead><tr><th>Date</th><th>Category</th><th>Details</th><th>Amount</th></tr></thead>
          <tbody>{expenses.map((x) => <tr key={x.id}><td>{prettyDate(x.date)}</td><td>{x.category}</td><td>{x.note}</td><td>{cedi(x.amount)}</td></tr>)}</tbody>
        </table></div>
      )}
    </>
  );
}
