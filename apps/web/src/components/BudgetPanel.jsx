import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useQuery } from '../lib/hooks';
import {
  addExpense, attendanceRangeQuery, deleteExpense, expensesQuery, financeDoc, recordWages, setBudget, sub, updateExpense,
} from '../lib/db';
import { save, toast } from '../lib/save';
import {
  EXPENSE_CATEGORIES, PAYMENT_METHODS, budgetLinesInput, budgetVariance, cedi, expenseCsv, expenseInput, prettyDate, siteFinanceSummary,
  spendByMonth, todayKey, validate, wageSheet, weekStart, currencySymbol } from '@siteflow/shared';
import { Empty, ErrorState, Loading } from './States';

const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return todayKey(d); };
// The first day of the month, five months back: enough for the six-month chart and the default list
const chartStart = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5); return todayKey(d); };
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

// Money for one site (finance roles). Totals come from the server; calculations from shared.
export default function BudgetPanel({ cid, site, data }) {
  const { can } = useAuth();
  const { data: f, loading, error } = useDoc(() => financeDoc(cid, site.id), [cid, site.id]);
  // Only the last six months are downloaded; "All" in the list fetches older ones when asked
  const from = chartStart();
  const { data: expenses, loading: eLoading } = useQuery(() => expensesQuery(cid, site.id, from, 1000), [cid, site.id, from]);
  const [editingBudget, setEditingBudget] = useState(false);

  if (loading) return <Loading what="budget" />;
  if (error) return <ErrorState error={error} what="the budget" />;
  if (!f) return <Empty title="No budget set for this site." />;
  const sum = siteFinanceSummary(f, site.progress || 0);
  const { rows, total } = budgetVariance(f);
  const months = spendByMonth(expenses).slice(-6);
  const top = Math.max(1, ...months.map((m) => m.amount));

  return (
    <>
      <dl className="cols">
        <div><dt>Budget</dt><dd>{cedi(sum.budget)}</dd></div>
        <div><dt>Spent</dt><dd>{cedi(sum.spent)}</dd></div>
        <div><dt>Remaining</dt><dd className={sum.remaining < 0 ? 'neg' : ''}>{cedi(sum.remaining)}</dd></div>
        <div><dt>Budget used / work done</dt><dd>{sum.usedPct}% / {sum.progress}%</dd></div>
        <div><dt>Expected final cost</dt><dd>{sum.forecast == null ? '–' : cedi(sum.forecast)}</dd></div>
      </dl>
      {sum.forecastOver > 0 && <p className="notice warn">At this rate the job would cost about {cedi(sum.forecast)}, {cedi(sum.forecastOver)} over budget.</p>}
      {sum.overspendRisk && <p className="err" role="alert">{sum.usedPct}% of the budget is spent but only {sum.progress}% of the work is done.</p>}
      <p className="hint">Totals update automatically from the expenses below. Expected final cost assumes spending carries on at the same rate per % of work.</p>

      <div className="section-head">
        <h3 className="sub">Budget by category</h3>
        {can('sites.manage') && !editingBudget && <button type="button" className="btn sm ghost" onClick={() => setEditingBudget(true)}>Edit budget</button>}
      </div>
      {editingBudget && <BudgetForm cid={cid} sid={site.id} f={f} onDone={() => setEditingBudget(false)} />}
      {!rows.length ? <Empty title="No spending or category budgets yet." /> : (
        <div className="scroll"><table>
          <thead><tr><th>Category</th><th>Budget</th><th>Spent</th><th>Left</th><th>Used</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category}>
                <td>{r.category}</td><td>{r.budget ? cedi(r.budget) : '–'}</td><td>{cedi(r.actual)}</td>
                <td className={r.variance < 0 ? 'neg' : ''}>{r.budget ? cedi(r.variance) : '–'}</td>
                <td>{r.usedPct == null ? '–' : <><span className={`pill ${r.over ? 'bad' : r.usedPct >= 90 ? 'warn' : 'ok'}`}>{r.usedPct}%</span></>}</td>
              </tr>
            ))}
            <tr className="total"><td><b>All</b></td><td><b>{cedi(total.budget)}</b></td><td><b>{cedi(total.actual)}</b></td><td className={total.variance < 0 ? 'neg' : ''}><b>{cedi(total.variance)}</b></td><td>{total.usedPct == null ? '–' : `${total.usedPct}%`}</td></tr>
          </tbody>
        </table></div>
      )}

      {!!months.length && (
        <>
          <h3 className="sub">Spending by month</h3>
          <ul className="bars" aria-label="Spending by month">
            {months.map((m) => (
              <li key={m.month}><span className="lbl">{new Date(`${m.month}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}</span>
                <span className="bar"><span style={{ width: `${(m.amount / top) * 100}%` }} /></span><span className="val">{cedi(m.amount)}</span></li>
            ))}
          </ul>
        </>
      )}

      <Wages cid={cid} site={site} data={data} expenses={expenses} />
      {can('finance.edit') && <ExpenseForm cid={cid} sid={site.id} />}
      {eLoading ? <Loading what="expenses" /> : <ExpenseList cid={cid} site={site} expenses={expenses} />}
    </>
  );
}

function BudgetForm({ cid, sid, f, onDone }) {
  const [total, setTotal] = useState(f.budget ?? '');
  const [lines, setLines] = useState(Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, f.budgetByCategory?.[c] ?? ''])));
  const [err, setErr] = useState('');
  const sumLines = Object.values(lines).reduce((s, v) => s + (Number(v) || 0), 0);
  async function submit(e) {
    e.preventDefault();
    const t = Number(total);
    if (!(t > 0)) return setErr('Enter the total budget.');
    const v = validate(budgetLinesInput, Object.fromEntries(Object.entries(lines).filter(([, x]) => x !== '')));
    if (!v.ok) return setErr(v.error);
    try { await save(setBudget(cid, sid, t, v.data), 'Budget'); toast('Budget saved.'); onDone(); } catch (e2) { setErr(e2.message); }
  }
  return (
    <form className="form inline" onSubmit={submit}>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="field"><label htmlFor="bt">Total budget ({currencySymbol()})</label><input id="bt" type="number" min="0" value={total} onChange={(e) => setTotal(e.target.value)} /></div>
      <div className="grid3">
        {EXPENSE_CATEGORIES.map((c) => (
          <div className="field" key={c}><label htmlFor={`bl-${c}`}>{c}</label>
            <input id={`bl-${c}`} type="number" min="0" value={lines[c]} onChange={(e) => setLines({ ...lines, [c]: e.target.value })} placeholder="No limit" /></div>
        ))}
      </div>
      <p className="hint">Categories add up to {cedi(sumLines)}{Number(total) && sumLines > Number(total) ? ', more than the total budget' : ''}. Leave a category empty for no separate limit.</p>
      <button className="btn">Save budget</button> <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
    </form>
  );
}

// Labour cost from attendance and daily rates, and recording it as a Labour expense
function Wages({ cid, site, data, expenses }) {
  const { user, profile, can } = useAuth();
  const [period, setPeriod] = useState('last');
  const [from, to] = useMemo(() => {
    const thisMon = weekStart();
    if (period === 'this') return [thisMon, todayKey()];
    const d = new Date(`${thisMon}T12:00:00`); d.setDate(d.getDate() - 7);
    const lastMon = todayKey(d); d.setDate(d.getDate() + 6);
    return period === 'last' ? [lastMon, todayKey(d)] : [ago(29), todayKey()];
  }, [period]);
  const { data: att } = useQuery(() => attendanceRangeQuery(cid, site.id, from, to), [cid, site.id, from, to]);
  const { data: payDocs } = useQuery(() => sub(cid, site.id, 'workerPay'), [cid, site.id]);
  const pay = Object.fromEntries(payDocs.map((p) => [p.id, p]));
  const sheet = wageSheet(data.allWorkers, pay, att);
  const recorded = expenses.find((e) => e.category === 'Labour' && e.note === `Wages ${from} to ${to}`);
  const noRate = data.allWorkers.filter((w) => !pay[w.id] && att.some((a) => a.marks?.[w.id] === 'present' || a.marks?.[w.id] === 'late')).length;

  async function record() {
    if (!window.confirm(`Record ${cedi(sheet.total)} wages for ${prettyDate(from)} to ${prettyDate(to)} as a Labour expense?`)) return;
    try { await save(recordWages(cid, site.id, { from, to, amount: sheet.total }, { uid: user.uid, name: profile.name }), 'Wages'); toast('Wages recorded.'); }
    catch (e) { toast(e.message, 'err'); }
  }
  return (
    <div className="form inline">
      <div className="row-between"><h3 className="m0">Labour cost from attendance</h3>
        <select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="last">Last week</option><option value="this">This week</option><option value="30">Last 30 days</option>
        </select></div>
      <p className="mt-sm">{prettyDate(from)} to {prettyDate(to)}: <b>{cedi(sheet.total)}</b> for {sheet.rows.length} worker{sheet.rows.length === 1 ? '' : 's'} ({sheet.rows.reduce((s, r) => s + r.days, 0)} days worked).</p>
      {noRate > 0 && <p className="hint">{noRate} worker{noRate === 1 ? ' has' : 's have'} no daily rate, so {noRate === 1 ? 'is' : 'are'} not counted. Set rates under Labour, Workers.</p>}
      {recorded ? <p className="notice ok">Recorded as an expense on {prettyDate(recorded.date)}.</p>
        : can('finance.edit') && sheet.total > 0 && <button type="button" className="btn ghost" onClick={record}>Record these wages as an expense</button>}
    </div>
  );
}

const blankExpense = () => ({ date: todayKey(), category: EXPENSE_CATEGORIES[0], amount: '', note: '', payee: '', method: 'Cash', ref: '' });
function expenseFields(f, set, prefix) {
  return (
    <div className="grid3">
      <div className="field"><label htmlFor={`${prefix}-d`}>Date paid</label><input id={`${prefix}-d`} type="date" max={todayKey()} value={f.date} onChange={set('date')} /></div>
      <div className="field"><label htmlFor={`${prefix}-c`}>Category</label><select id={`${prefix}-c`} value={f.category} onChange={set('category')}>{[...new Set([...EXPENSE_CATEGORIES, f.category])].map((c) => <option key={c}>{c}</option>)}</select></div>
      <div className="field"><label htmlFor={`${prefix}-a`}>Amount ({currencySymbol()})</label><input id={`${prefix}-a`} type="number" min="0" step="0.01" value={f.amount} onChange={set('amount')} /></div>
      <div className="field"><label htmlFor={`${prefix}-n`}>Details</label><input id={`${prefix}-n`} value={f.note} onChange={set('note')} placeholder="e.g. Tipper truck, two trips" /></div>
      <div className="field"><label htmlFor={`${prefix}-p`}>Paid to</label><input id={`${prefix}-p`} value={f.payee} onChange={set('payee')} /></div>
      <div className="field"><label htmlFor={`${prefix}-m`}>Paid by</label><select id={`${prefix}-m`} value={f.method} onChange={set('method')}><option value="">–</option>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
      <div className="field"><label htmlFor={`${prefix}-r`}>Receipt or ref</label><input id={`${prefix}-r`} value={f.ref} onChange={set('ref')} /></div>
    </div>
  );
}

function ExpenseForm({ cid, sid }) {
  const { user, profile } = useAuth();
  const [f, setF] = useState(blankExpense());
  const [msg, setMsg] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    const v = validate(expenseInput, f);
    if (!v.ok) return setMsg({ kind: 'err', text: v.error });
    try {
      await save(addExpense(cid, sid, v.data, { uid: user.uid, name: profile.name }), 'Expense');
      setMsg({ kind: 'ok', text: `${cedi(v.data.amount)} recorded. Totals update in a moment.` });
      setF({ ...blankExpense(), category: f.category, method: f.method });
    } catch (e2) { setMsg({ kind: 'err', text: e2.message }); }
  }
  return (
    <form className="form inline" onSubmit={submit}>
      <h3>Record an expense</h3>
      {msg.text && <p className={msg.kind === 'err' ? 'err' : 'notice ok'} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
      {expenseFields(f, set, 'ne')}
      <button type="submit" className="btn ghost">Save expense</button>
    </form>
  );
}

function ExpenseList({ cid, site, expenses }) {
  const { can } = useAuth();
  const [days, setDays] = useState('90');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState(null);
  const from = days === 'all' ? '' : ago(Number(days) - 1);
  const older = useQuery(() => days === 'all' && expensesQuery(cid, site.id, '', 2000), [cid, site.id, days === 'all']);
  const source = days === 'all' ? older.data : expenses;
  const shown = source.filter((e) => (!from || e.date >= from) && (!category || e.category === category));
  const total = shown.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return (
    <>
      <div className="section-head">
        <h3 className="sub">Expenses</h3>
        <span className="actions">
          <select aria-label="Period" value={days} onChange={(e) => setDays(e.target.value)}><option value="30">Last 30 days</option><option value="90">Last 3 months</option><option value="all">All</option></select>
          <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <button type="button" className="btn sm ghost" onClick={() => download(`expenses-${site.name.replace(/[^\w]+/g, '-')}.csv`, expenseCsv(shown))}>Download (CSV)</button>
        </span>
      </div>
      {days === 'all' && older.loading ? <Loading what="all expenses" /> : !shown.length ? <Empty title="No expenses in this period." /> : (
        <div className="scroll"><table>
          <thead><tr><th>Date</th><th>Category</th><th>Details</th><th>Paid to</th><th>Paid by</th><th>Amount</th><th /></tr></thead>
          <tbody>
            {shown.map((x) => editing === x.id
              ? <tr key={x.id}><td colSpan={7}><EditExpense cid={cid} sid={site.id} x={x} onDone={() => setEditing(null)} /></td></tr>
              : (
                <tr key={x.id}>
                  <td>{prettyDate(x.date)}</td><td>{x.category}</td>
                  <td>{x.note}{x.ref ? <div className="muted small">Ref {x.ref}</div> : null}<div className="muted small">{x.createdByName}</div></td>
                  <td>{x.payee || '–'}</td><td>{x.method || '–'}</td><td><b>{cedi(x.amount)}</b></td>
                  <td>{can('finance.edit') && <button type="button" className="btn sm ghost" onClick={() => setEditing(x.id)}>Edit</button>}</td>
                </tr>
              ))}
            <tr className="total"><td colSpan={5}><b>Total shown</b></td><td><b>{cedi(total)}</b></td><td /></tr>
          </tbody>
        </table></div>
      )}
    </>
  );
}

function EditExpense({ cid, sid, x, onDone }) {
  const [f, setF] = useState({ date: x.date, category: x.category, amount: x.amount, note: x.note || '', payee: x.payee || '', method: x.method || '', ref: x.ref || '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    const v = validate(expenseInput, f);
    if (!v.ok) return setErr(v.error);
    try { await save(updateExpense(cid, sid, x.id, v.data), 'Expense'); onDone(); } catch (e2) { setErr(e2.message); }
  }
  async function remove() {
    if (!window.confirm(`Delete this ${cedi(x.amount)} expense? The site's totals will be worked out again.`)) return;
    try { await save(deleteExpense(cid, sid, x.id), 'Expense'); onDone(); } catch (e2) { setErr(e2.message); }
  }
  return (
    <form className="form compact" onSubmit={submit}>
      {err && <p className="err" role="alert">{err}</p>}
      {expenseFields(f, set, `ee-${x.id}`)}
      <button className="btn">Save</button> <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>{' '}
      <button type="button" className="btn ghost danger" onClick={remove}>Delete</button>
    </form>
  );
}
