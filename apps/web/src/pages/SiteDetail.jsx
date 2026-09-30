import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useQuery, useSiteData } from '../lib/hooks';
import { addExpense, addMaterial, expensesQuery, financeDoc, reportsQuery, siteDoc } from '../lib/db';
import { save, savedText } from '../lib/save';
import {
  EXPENSE_CATEGORIES, UNITS, budgetRemaining, budgetUsedPct, cedi, expenseInput, materialInput, prettyDate, validate,
} from '@siteflow/shared';
import Tabs from '../components/Tabs';
import ReportCard from '../components/ReportCard';
import MaterialsTable from '../components/MaterialsTable';
import MaterialLogForm from '../components/MaterialLogForm';
import AttendanceList from '../components/AttendanceList';
import AddWorkerForm from '../components/AddWorkerForm';
import { Empty, ErrorState, Loading } from '../components/States';

export default function SiteDetail() {
  const { sid } = useParams();
  const { cid, can } = useAuth();
  const [tab, setTab] = useState('reports');
  const { data: site, loading, error } = useDoc(() => cid && siteDoc(cid, sid), [cid, sid]);
  const data = useSiteData(cid, sid, { withPay: can('finance.view') });

  if (loading) return <Loading />;
  if (error) return <section className="wrap"><ErrorState error={error} what="this site" /></section>;
  if (!site) return <p className="pad">This site doesn't exist or you don't have access. <Link to="/">Back to dashboard</Link></p>;

  const tabs = [['reports', 'Daily reports'], ['materials', 'Materials'], ['labour', 'Labour']];
  if (can('finance.view')) tabs.push(['budget', 'Budget']);

  return (
    <section className="wrap">
      <Link to="/" className="btn sm ghost back">All sites</Link>
      <div className="row-between">
        <h1>{site.name}</h1>
        {can('site.work') && <Link to={`/work/${sid}`} className="btn ghost">Open site workspace</Link>}
      </div>
      <div className="meta"><span>{site.location}</span><span>Foreman: {site.foremanName || '–'}</span><span>Stage: {site.stage}</span></div>
      <div className="prog"><div className="meter"><span style={{ width: `${site.progress || 0}%` }} /></div><b>{site.progress || 0}% complete</b></div>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {data.error && tab !== 'reports' && tab !== 'budget' && <ErrorState error={data.error} what="site data" />}
      {tab === 'reports' && <ReportsTab cid={cid} sid={sid} />}
      {tab === 'materials' && (
        <>
          <MaterialsTable materials={data.materials} usage={data.usage} />
          {can('site.work') && <><h3 className="sub">Log usage or a delivery</h3><MaterialLogForm cid={cid} sid={sid} materials={data.materials} /></>}
          {can('sites.manage') && <AddMaterialForm cid={cid} sid={sid} />}
        </>
      )}
      {tab === 'labour' && (
        <>
          <AttendanceList cid={cid} sid={sid} workers={data.workers} present={data.present} pay={data.pay} readOnly={!can('site.work')} />
          {can('site.work') && <AddWorkerForm cid={cid} sid={sid} />}
        </>
      )}
      {tab === 'budget' && can('finance.view') && <BudgetTab cid={cid} sid={sid} site={site} />}
    </section>
  );
}

function ReportsTab({ cid, sid }) {
  const { data, loading, error } = useQuery(() => reportsQuery(cid, sid), [cid, sid]);
  if (loading) return <Loading what="reports" />;
  if (error) return <ErrorState error={error} what="reports" />;
  if (!data.length) return <Empty title="No daily reports yet.">They appear here as soon as the site team sends one.</Empty>;
  return data.map((r) => <ReportCard key={r.id} r={r} />);
}

function AddMaterialForm({ cid, sid }) {
  const blank = { name: '', unit: UNITS[0], stock: '', reorderLevel: '', avgDaily: '' };
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState({ kind: '', text: '' });
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
        <div className="field"><label htmlFor="am-n">Name</label><input id="am-n" value={f.name} onChange={set('name')} placeholder="e.g. Cement (50kg)" /></div>
        <div className="field"><label htmlFor="am-u">Unit</label><select id="am-u" value={f.unit} onChange={set('unit')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></div>
        <div className="field"><label htmlFor="am-s">Opening stock</label><input id="am-s" type="number" min="0" value={f.stock} onChange={set('stock')} /></div>
        <div className="field"><label htmlFor="am-r">Reorder when below</label><input id="am-r" type="number" min="0" value={f.reorderLevel} onChange={set('reorderLevel')} /></div>
        <div className="field"><label htmlFor="am-a">Usual daily use</label><input id="am-a" type="number" min="0" value={f.avgDaily} onChange={set('avgDaily')} />
          <p className="hint">Used to flag unusually high use.</p></div>
      </div>
      <button className="btn ghost" disabled={busy}>{busy ? 'Saving…' : 'Add material'}</button>
    </form>
  );
}

function BudgetTab({ cid, sid, site }) {
  const { user, can } = useAuth();
  const { data: finance, loading: fLoading, error: fError } = useDoc(() => financeDoc(cid, sid), [cid, sid]);
  const { data: expenses, loading, error } = useQuery(() => expensesQuery(cid, sid), [cid, sid]);
  const [f, setF] = useState({ category: EXPENSE_CATEGORIES[0], note: '', amount: '' });
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);

  if (fLoading) return <Loading what="budget" />;
  if (fError) return <ErrorState error={fError} what="the budget" />;
  if (!finance) return <Empty title="No budget set for this site.">A project manager can set one when editing the site.</Empty>;
  const p = budgetUsedPct(finance);

  async function submit(e) {
    e.preventDefault();
    const v = validate(expenseInput, f);
    if (!v.ok) return setMsg({ kind: 'err', text: v.error });
    setBusy(true); setMsg({});
    try {
      const res = await save(addExpense(cid, sid, { ...v.data, uid: user.uid }), 'Expense');
      setMsg({ kind: 'ok', text: savedText(res, 'Expense') });
      setF({ ...f, note: '', amount: '' });
    } catch (e2) {
      setMsg({ kind: 'err', text: e2.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <dl className="cols">
        <div><dt>Budget</dt><dd>{cedi(finance.budget)}</dd></div>
        <div><dt>Spent</dt><dd>{cedi(finance.spent)}</dd></div>
        <div><dt>Remaining</dt><dd>{cedi(budgetRemaining(finance))}</dd></div>
        <div><dt>Work done</dt><dd>{site.progress || 0}%</dd></div>
      </dl>
      {p >= 90 && <p className="err">{p}% of the budget is spent but only {site.progress || 0}% of the work is done.</p>}
      {can('finance.edit') && (
        <form className="form inline" onSubmit={submit}>
          <h3>Record an expense</h3>
          {msg.text && <p className={msg.kind === 'err' ? 'err' : 'notice ok'} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
          <div className="grid3">
            <div className="field"><label htmlFor="x-c">Category</label><select id="x-c" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label htmlFor="x-n">Details</label><input id="x-n" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
            <div className="field"><label htmlFor="x-a">Amount (GH₵)</label><input id="x-a" type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
          </div>
          <button className="btn ghost" disabled={busy}>{busy ? 'Saving…' : 'Save expense'}</button>
        </form>
      )}
      <h3 className="sub">Recent expenses</h3>
      {loading ? <Loading what="expenses" /> : error ? <ErrorState error={error} what="expenses" /> : !expenses.length ? <Empty title="No expenses recorded yet." /> : (
        <div className="scroll"><table>
          <thead><tr><th>Date</th><th>Category</th><th>Details</th><th>Amount</th></tr></thead>
          <tbody>{expenses.map((x) => <tr key={x.id}><td>{prettyDate(x.date)}</td><td>{x.category}</td><td>{x.note}</td><td>{cedi(x.amount)}</td></tr>)}</tbody>
        </table></div>
      )}
    </>
  );
}
