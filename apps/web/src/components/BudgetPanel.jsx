import { useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useQuery } from '../lib/hooks';
import {
  addExpense, attendanceRangeQuery, expenseHistoryQuery, expensesQuery, financeDoc, newExpenseId, setBudget, sub, updateExpense, voidExpense,
} from '../lib/db';
import { recordWages } from '../lib/account';
import { save, toast } from '../lib/save';
import {
  EXPENSE_CATEGORIES, PAYMENT_METHODS, budgetLinesInput, budgetVariance, cedi, expenseCsv, expenseInput, friendlyError, isManualLabour, periodsOverlap, prettyDate, siteFinanceSummary,
  spendByMonth, todayKey, validate, voidExpenseInput, wageSheet, weekStart, currencySymbol } from '@siteflow/shared';
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
          <thead><tr><th>Category</th><th className="num">Budget</th><th className="num">Spent</th><th className="num">Left</th><th>Used</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category}>
                <td>{r.category}</td><td className="num">{r.budget ? cedi(r.budget) : '–'}</td><td className="num">{cedi(r.actual)}</td>
                <td className={`num${r.variance < 0 ? ' overrun' : ''}`}>{r.budget ? (r.variance < 0 ? `${cedi(-r.variance)} over` : cedi(r.variance)) : '–'}</td>
                <td>{r.usedPct == null ? '–' : <><span className={`pill ${r.over ? 'bad' : r.usedPct >= 90 ? 'warn' : 'ok'}`}>{r.usedPct}%</span></>}</td>
              </tr>
            ))}
            <tr className="total"><td><b>All</b></td><td className="num"><b>{cedi(total.budget)}</b></td><td className="num"><b>{cedi(total.actual)}</b></td><td className={`num${total.variance < 0 ? ' overrun' : ''}`}><b>{total.variance < 0 ? `${cedi(-total.variance)} over` : cedi(total.variance)}</b></td><td>{total.usedPct == null ? '–' : `${total.usedPct}%`}</td></tr>
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
  const { can } = useAuth();
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
  // A wage payment (not voided) covering any day of this period
  const recorded = expenses.find((e) => !e.voided && e.period && periodsOverlap(e.period, { from, to }))
    || expenses.find((e) => !e.voided && e.category === 'Labour' && e.note === `Wages ${from} to ${to}`);
  const [busy, setBusy] = useState(false);
  // Labour entered by hand in these days (not from attendance): shown so it isn't paid twice by mistake
  const manual = expenses.filter((e) => isManualLabour(e) && e.date >= from && e.date <= to);
  const noRate = data.allWorkers.filter((w) => !pay[w.id] && att.some((a) => a.marks?.[w.id] === 'present' || a.marks?.[w.id] === 'late')).length;

  async function record() {
    if (!window.confirm(`Record ${cedi(sheet.total)} wages for ${prettyDate(from)} to ${prettyDate(to)} as a Labour expense? Attendance for these days is then locked, so it matches what was paid.`)) return;
    setBusy(true);
    try {
      const r = await recordWages({ siteId: site.id, from, to });
      toast(`Wages of ${cedi(r.amount)} recorded for ${r.workers} workers. Attendance for the period is locked.${r.manual?.count ? ` Note: ${cedi(r.manual.total)} of labour entered by hand in the same days is a separate payment.` : ''}`);
    }
    catch (e) { toast(friendlyError(e), 'err'); } finally { setBusy(false); }
  }
  return (
    <div className="form inline">
      <div className="row-between"><h3 className="m0">Labour cost from attendance</h3>
        <select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="last">Last week</option><option value="this">This week</option><option value="30">Last 30 days</option>
        </select></div>
      <p className="mt-sm">{prettyDate(from)} to {prettyDate(to)}: <b>{cedi(sheet.total)}</b> for {sheet.rows.length} worker{sheet.rows.length === 1 ? '' : 's'} ({sheet.rows.reduce((s, r) => s + r.days, 0)} days worked).</p>
      {manual.length > 0 && <p className="hint">Also in these days: {cedi(manual.reduce((t, e) => t + (Number(e.amount) || 0), 0))} of labour entered by hand ({manual.map((e) => e.labourReason || e.note || 'no reason').join('; ')}). It is not from attendance, so check it isn't the same work.</p>}
      {noRate > 0 && <p className="hint">{noRate} worker{noRate === 1 ? ' has' : 's have'} no daily rate, so {noRate === 1 ? 'is' : 'are'} not counted. Set rates under Labour, Workers.</p>}
      {recorded ? <p className="notice ok">Paid: {cedi(recorded.amount)} recorded {recorded.period ? `for ${prettyDate(recorded.period.from)} to ${prettyDate(recorded.period.to)}` : `on ${prettyDate(recorded.date)}`}. {recorded.period ? 'Attendance for those days is locked. To correct it, void that wage payment in the expenses below, then record again.' : ''}</p>
        : can('finance.edit') && sheet.total > 0 && <button type="button" className="btn ghost" onClick={record} disabled={busy}>{busy ? 'Recording…' : 'Record these wages as an expense'}</button>}
    </div>
  );
}

const blankExpense = () => ({ date: todayKey(), category: EXPENSE_CATEGORIES[0], amount: '', note: '', payee: '', method: 'Cash', ref: '', labourReason: '' });
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
      {f.category === 'Labour' && (
        <div className="field span-all"><label htmlFor={`${prefix}-lr`}>Labour paid by hand: what for?</label>
          <input id={`${prefix}-lr`} value={f.labourReason || ''} onChange={set('labourReason')} maxLength={300} placeholder="e.g. Tiling gang, paid by the job" />
          <p className="hint">Wages for days marked in attendance are recorded under Labour cost from attendance, which locks those days. Use this for labour paid another way.</p></div>
      )}
    </div>
  );
}

function ExpenseForm({ cid, sid }) {
  const { user, profile } = useAuth();
  const [f, setF] = useState(blankExpense());
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  const idRef = useRef(null); // one id per expense being entered (see newExpenseId)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const v = validate(expenseInput, f);
    if (!v.ok) return setMsg({ kind: 'err', text: v.error });
    idRef.current = idRef.current || newExpenseId(cid, sid);
    setBusy(true);
    try {
      await save(addExpense(cid, sid, v.data, { uid: user.uid, name: profile.name }, idRef.current), 'Expense');
      idRef.current = null;
      setMsg({ kind: 'ok', text: `${cedi(v.data.amount)} recorded. Totals update in a moment.` });
      setF({ ...blankExpense(), category: f.category, method: f.method });
    } catch (e2) { setMsg({ kind: 'err', text: e2.message }); } finally { setBusy(false); }
  }
  return (
    <form className="form inline" onSubmit={submit}>
      <h3>Record an expense</h3>
      {msg.text && <p className={msg.kind === 'err' ? 'err' : 'notice ok'} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
      {expenseFields(f, set, 'ne')}
      <button type="submit" className="btn ghost" disabled={busy}>{busy ? 'Saving…' : 'Save expense'}</button>
    </form>
  );
}

function ExpenseList({ cid, site, expenses }) {
  const { can } = useAuth();
  const [days, setDays] = useState('90');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState(null);
  const [history, setHistory] = useState(null);
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
          <button type="button" className="btn sm ghost" onClick={() => download(`expenses-${site.name.replace(/[^\w]+/g, '-')}.csv`, expenseCsv(shown.map((x) => (x.voided ? { ...x, note: `VOID (${cedi(x.voidedAmount)}): ${x.voidReason}. ${x.note || ''}` } : x))
  .map((x) => (x.category === 'Labour' ? { ...x, note: `${x.period ? 'FROM ATTENDANCE' : `BY HAND (${x.labourReason || 'no reason'})`}. ${x.note || ''}` } : x))))}>Download (CSV)</button>
        </span>
      </div>
      {days === 'all' && older.loading ? <Loading what="all expenses" /> : !shown.length ? <Empty title="No expenses in this period." /> : (
        <div className="scroll"><table>
          <thead><tr><th>Date</th><th>Category</th><th>Details</th><th>Paid to</th><th>Paid by</th><th className="num">Amount</th><th /></tr></thead>
          <tbody>
            {shown.map((x) => editing === x.id
              ? <tr key={x.id}><td colSpan={7}><EditExpense cid={cid} sid={site.id} x={x} onDone={() => setEditing(null)} /></td></tr>
              : (
                [<tr key={x.id} className={x.voided ? 'voided' : ''}>
                  <td>{prettyDate(x.date)}</td><td>{x.category}{x.period ? <div className="small muted">from attendance</div> : x.category === 'Labour' ? <div className="small tag-manual">by hand</div> : null}</td>
                  <td>{x.note}{x.ref ? <div className="muted small">Ref {x.ref}</div> : null}
                    <div className="muted small">{x.createdByName}{x.updatedByName && x.updatedByName !== x.createdByName ? `, changed by ${x.updatedByName}` : ''}</div>
                    {x.category === 'Labour' && !x.period && <div className="small muted">Why by hand: {x.labourReason || 'no reason recorded'}</div>}
                    {x.voided && <div className="small void-note">Void: {x.voidReason} ({x.voidedByName})</div>}</td>
                  <td>{x.payee || '–'}</td><td>{x.method || '–'}</td>
                  <td className="num">{x.voided ? <><s>{cedi(x.voidedAmount)}</s><div className="small muted">not counted</div></> : <b>{cedi(x.amount)}</b>}</td>
                  <td className="nowrap">
                    {can('finance.edit') && !x.voided && <button type="button" className="btn sm ghost" onClick={() => setEditing(x.id)}>Edit</button>}{' '}
                    <button type="button" className="btn sm ghost" aria-expanded={history === x.id} onClick={() => setHistory(history === x.id ? null : x.id)}>History</button>
                  </td>
                </tr>,
                history === x.id && <tr key={`${x.id}-h`}><td colSpan={7}><ExpenseHistory cid={cid} sid={site.id} id={x.id} /></td></tr>]
              ))}
            <tr className="total"><td colSpan={5}><b>Total shown</b></td><td className="num"><b>{cedi(total)}</b></td><td /></tr>
          </tbody>
        </table></div>
      )}
    </>
  );
}

function EditExpense({ cid, sid, x, onDone }) {
  const { user, profile } = useAuth();
  const me = { uid: user.uid, name: profile.name };
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [f, setF] = useState({ date: x.date, category: x.category, amount: x.amount, note: x.note || '', payee: x.payee || '', method: x.method || '', ref: x.ref || '', labourReason: x.labourReason || '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    const v = validate(expenseInput, f);
    if (!v.ok) return setErr(v.error);
    try { await save(updateExpense(cid, sid, x.id, v.data, me), 'Expense'); onDone(); } catch (e2) { setErr(e2.message); }
  }
  async function voidIt() {
    const v = validate(voidExpenseInput, { reason });
    if (!v.ok) return setErr(v.error);
    if (!window.confirm(`Void this ${cedi(x.amount)} expense? It stays on record with your reason but is no longer counted. This can't be undone.`)) return;
    try { await save(voidExpense(cid, sid, x, v.data.reason, me), 'Expense'); toast('Expense voided.'); onDone(); } catch (e2) { setErr(e2.message); }
  }
  return (
    <form className="form compact" onSubmit={submit}>
      {err && <p className="err" role="alert">{err}</p>}
      {x.period ? <p className="hint">This is a wage payment for {prettyDate(x.period.from)} to {prettyDate(x.period.to)}, worked out from attendance. It can be voided (which unlocks that attendance) but not edited.</p> : expenseFields(f, set, `ee-${x.id}`)}
      {!x.period && <><button className="btn">Save</button>{' '}</>}<button type="button" className="btn ghost" onClick={onDone}>Cancel</button>{' '}
      {!voiding ? <button type="button" className="btn ghost danger" onClick={() => setVoiding(true)}>Void…</button> : (
        <span className="void-form">
          <label htmlFor={`vr-${x.id}`} className="visually-hidden">Reason</label>
          <input id={`vr-${x.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it void? e.g. Entered twice" maxLength={300} />
          <button type="button" className="btn danger-solid sm" onClick={voidIt}>Void expense</button>
        </span>
      )}
    </form>
  );
}

// Who changed an expense and how (written by the server, never edited)
function ExpenseHistory({ cid, sid, id }) {
  const { data, loading } = useQuery(() => expenseHistoryQuery(cid, sid, id), [cid, sid, id]);
  if (loading) return <Loading what="history" />;
  if (!data.length) return <p className="muted small">No changes recorded. (Expenses entered before the history started show none.)</p>;
  const when = (t) => (t?.toDate ? t.toDate().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '');
  const fmt = (k, v) => (k === 'amount' ? cedi(v || 0) : k === 'date' && v ? prettyDate(v) : (v || '–'));
  return (
    <ol className="history">
      {data.map((h) => (
        <li key={h.id}><b>{h.byName}</b> {h.action === 'created' ? 'entered it' : h.action === 'voided' ? `voided it: ${h.reason}` : 'changed it'} <span className="muted small">{when(h.at)}</span>
          {h.action === 'edited' && <ul>{(h.changed || []).map((k) => <li key={k} className="small">{k}: {fmt(k, h.before?.[k])} → {fmt(k, h.after?.[k])}</li>)}</ul>}
          {h.detail && <div className="small muted">{h.detail}</div>}
        </li>
      ))}
    </ol>
  );
}
