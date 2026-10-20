import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { onSnapshot } from 'firebase/firestore';
import { EXPENSE_CATEGORIES, cedi, portfolioTotals, siteFinanceSummary } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useQuery, useTitle } from '../lib/hooks';
import { financeDoc, sitesCol } from '../lib/db';
import StatusPill from '../components/StatusPill';
import { Empty, ErrorState, Loading } from '../components/States';
import PageHead from '../components/PageHead';

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// Money across every site (finance roles)
export default function Finance() {
  useTitle('Finance');
  const { cid } = useAuth();
  const { data: sites, loading, error } = useQuery(() => cid && sitesCol(cid), [cid]);
  const [showClosed, setShowClosed] = useState(false);
  const [fin, setFin] = useState({});
  const key = sites.map((s) => s.id).join(',');
  useEffect(() => {
    if (!cid || !sites.length) return;
    const un = sites.map((s) => onSnapshot(financeDoc(cid, s.id), (d) => setFin((p) => ({ ...p, [s.id]: d.data() || null })), (e) => console.error('finance', e)));
    return () => un.forEach((u) => u());
  }, [cid, key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Loading what="finance" />;
  if (error) return <section className="wrap"><ErrorState error={error} what="finance" /></section>;
  const list = sites.filter((s) => showClosed || s.status !== 'closed').sort((a, b) => a.name.localeCompare(b.name));
  const rows = list.map((s) => ({ site: s, f: fin[s.id], sum: siteFinanceSummary(fin[s.id], s.progress || 0) }));
  const t = portfolioTotals(rows.map((r) => r.sum));
  const cats = EXPENSE_CATEGORIES.map((c) => ({
    c, budget: rows.reduce((x, r) => x + (r.f?.budgetByCategory?.[c] || 0), 0), spent: rows.reduce((x, r) => x + (r.f?.byCategory?.[c] || 0), 0),
  })).filter((x) => x.budget || x.spent);
  const risky = rows.filter((r) => r.sum.overspendRisk || (r.sum.forecastOver || 0) > 0);

  const csv = () => download('siteflow-finance.csv', [
    ['Site', 'Status', 'Budget', 'Spent', 'Remaining', 'Budget used %', 'Work done %', 'Expected final cost'],
    ...rows.map((r) => [r.site.name, r.site.status, r.sum.budget, r.sum.spent, r.sum.remaining, r.sum.usedPct, r.sum.progress, r.sum.forecast ?? '']),
  ].map((r) => r.map(esc).join(',')).join('\n'));

  return (
    <>
    <PageHead title="Finance" sub="Budgets and spending across your projects. Totals update automatically from each project's expenses.">
      <button type="button" className="btn ghost" onClick={csv}>Download (CSV)</button>
    </PageHead>
    <section className="wrap">
      <div>
      </div>
      <dl className="strip">
        <div><dt>Total budget</dt><dd>{cedi(t.budget)}</dd></div>
        <div><dt>Spent</dt><dd>{cedi(t.spent)}</dd></div>
        <div><dt>Remaining</dt><dd className={t.remaining < 0 ? 'neg' : ''}>{cedi(t.remaining)}</dd></div>
        <div><dt>Budget used</dt><dd>{t.usedPct}%</dd></div>
      </dl>
      {!!risky.length && <p className="notice warn">Watch: {risky.map((r) => r.site.name).join(', ')}. Spending is running ahead of the work done.</p>}

      <div className="row-between"><h2 className="sec">By site</h2>
        <label className="chip"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Include closed sites</label></div>
      {!rows.length ? <Empty title="No sites yet." /> : (
        <div className="scroll"><table>
          <thead><tr><th>Site</th><th className="num">Budget</th><th className="num">Spent</th><th className="num">Remaining</th><th>Budget used / work done</th><th className="num">Expected final cost</th></tr></thead>
          <tbody>
            {rows.map(({ site: s, sum }) => (
              <tr key={s.id}>
                <td><Link to={`/sites/${s.id}?tab=budget`}>{s.name}</Link> {s.status !== 'active' && <StatusPill status={s.status} />}</td>
                <td className="num">{cedi(sum.budget)}</td><td className="num">{cedi(sum.spent)}</td><td className={`num${sum.remaining < 0 ? ' overrun' : ''}`}>{cedi(sum.remaining)}</td>
                <td><div className={`meter ${sum.overspendRisk ? 'hot' : ''}`}><span style={{ width: `${Math.min(sum.usedPct, 100)}%` }} /></div><small className="muted">{sum.usedPct}% used, {sum.progress}% done</small></td>
                <td className="num">{sum.forecast == null ? '–' : cedi(sum.forecast)}{sum.forecastOver > 0 && <div className="overrun">{cedi(sum.forecastOver)} over</div>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      {!!cats.length && (
        <>
          <h2 className="sec">By category</h2>
          <div className="scroll"><table>
            <thead><tr><th>Category</th><th className="num">Budget</th><th className="num">Spent</th><th className="num">Left</th><th>Used</th></tr></thead>
            <tbody>{cats.map((x) => (
              <tr key={x.c}><td>{x.c}</td><td className="num">{x.budget ? cedi(x.budget) : '–'}</td><td className="num">{cedi(x.spent)}</td><td className={`num${x.budget && x.spent > x.budget ? ' overrun' : ''}`}>{x.budget ? (x.spent > x.budget ? `${cedi(x.spent - x.budget)} over` : cedi(x.budget - x.spent)) : '–'}</td>
                <td>{x.budget ? <div className={`meter ${x.spent > x.budget ? 'hot' : ''}`}><span style={{ width: `${Math.min(100, Math.round((x.spent / x.budget) * 100))}%` }} /></div> : <span className="muted">–</span>}</td></tr>
            ))}</tbody>
          </table></div>
          <p className="hint">Category budgets are set per site under Budget, Edit budget.</p>
        </>
      )}
    </section>
    </>
  );
}
