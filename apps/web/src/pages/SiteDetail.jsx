import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useQuery, useSiteData } from '../lib/hooks';
import {
  addExpense, expensesQuery, financeDoc, setBudget, setSiteStatus, siteDoc, teamQuery, updateSiteDetails,
} from '../lib/db';
import { save, savedText, toast } from '../lib/save';
import { team } from '../lib/account';
import {
  EXPENSE_CATEGORIES, ROLE_LABELS, SITE_STATUSES, SITE_STATUS_LABELS, budgetInput, budgetRemaining, budgetUsedPct, cedi,
  expenseInput, friendlyError, isSiteOpen, materialStatus, plannedPct, prettyDate, siteFormValues, siteTeam, todayKey,
  validate, waPhone,
} from '@siteflow/shared';
import Tabs from '../components/Tabs';
import ReportHistory from '../components/ReportHistory';
import MaterialsPanel from '../components/MaterialsPanel';
import LabourPanel from '../components/LabourPanel';
import SiteForm from '../components/SiteForm';
import StatusPill from '../components/StatusPill';
import { Empty, ErrorState, Loading } from '../components/States';

export default function SiteDetail() {
  const { sid } = useParams();
  const { cid, can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const setTab = (t) => setParams({ tab: t }, { replace: true });
  const { data: site, loading, error } = useDoc(() => cid && siteDoc(cid, sid), [cid, sid]);
  const data = useSiteData(cid, sid, { withPay: can('finance.view') });

  if (loading) return <Loading />;
  if (error) return <section className="wrap"><ErrorState error={error} what="this site" /></section>;
  if (!site) return <p className="pad">This site doesn't exist or you don't have access. <Link to="/sites">Back to sites</Link></p>;

  const open = isSiteOpen(site);
  const work = can('site.work') && open;
  const tabs = [['overview', 'Overview'], ['reports', 'Daily reports'], ['materials', 'Materials'], ['labour', 'Labour']];
  if (can('finance.view')) tabs.push(['budget', 'Budget']);
  tabs.push(['team', 'Team']);
  if (can('sites.manage')) tabs.push(['settings', 'Settings']);

  return (
    <section className="wrap">
      <Link to="/sites" className="btn sm ghost back">All sites</Link>
      <div className="row-between">
        <h1>{site.name} <StatusPill status={site.status} /></h1>
        {work && <Link to={`/work/${sid}`} className="btn ghost">Open site workspace</Link>}
      </div>
      <div className="meta"><span>{site.location}</span><span>Foreman: {site.foremanName || '–'}</span><span>Stage: {site.stage}</span></div>
      <div className="prog"><div className="meter"><span style={{ width: `${site.progress || 0}%` }} /></div><b>{site.progress || 0}% complete</b></div>
      {!open && (
        <p className="notice warn">
          This site is closed. Its records are kept and can be viewed, but no new reports, attendance or materials can be added.
          {can('sites.manage') ? ' Reopen it from Settings.' : ''}
        </p>
      )}
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {data.error && ['materials', 'labour', 'overview'].includes(tab) && <ErrorState error={data.error} what="site data" />}
      {tab === 'overview' && <OverviewTab site={site} data={data} />}
      {tab === 'reports' && <ReportHistory cid={cid} site={site} />}
      {tab === 'materials' && <MaterialsPanel cid={cid} site={site} data={data} canWork={work} />}
      {tab === 'labour' && <LabourPanel cid={cid} site={site} data={data} canWork={work} />}
      {tab === 'budget' && can('finance.view') && <BudgetTab cid={cid} sid={sid} site={site} />}
      {tab === 'team' && <TeamTab cid={cid} sid={sid} site={site} />}
      {tab === 'settings' && can('sites.manage') && <SettingsTab cid={cid} sid={sid} site={site} />}
    </section>
  );
}

function OverviewTab({ site, data }) {
  const today = todayKey();
  const planned = plannedPct(site);
  const low = data.materials.filter((m) => materialStatus(m, data.usage[m.id]).low);
  const contact = (name, phone, email) => (
    <>
      <b>{name || '–'}</b>
      {phone && <div className="small"><a href={`tel:${phone}`}>{phone}</a> · <a href={`https://wa.me/${waPhone(phone)}`} target="_blank" rel="noreferrer">WhatsApp</a></div>}
      {email && <div className="small"><a href={`mailto:${email}`}>{email}</a></div>}
    </>
  );
  const dates = site.planStart || site.planEnd
    ? `${site.planStart ? prettyDate(site.planStart) : '?'} to ${site.planEnd ? prettyDate(site.planEnd) : '?'}`
    : 'No dates set';
  return (
    <>
      <dl className="cols">
        <div><dt>Today's report</dt><dd>{site.lastReportDate === today ? `Sent ${site.lastReportTime}` : site.status === 'active' ? 'Not yet' : '–'}</dd></div>
        <div><dt>Workers on site today</dt><dd>{data.presentCount}</dd></div>
        <div><dt>Materials to reorder</dt><dd>{low.length}</dd></div>
        <div><dt>Progress / planned</dt><dd>{site.progress || 0}%{planned != null ? ` / ${planned}%` : ''}</dd></div>
      </dl>
      <div className="grid2">
        <div className="card">
          <h3>Project</h3>
          <dl className="facts">
            <dt>Status</dt><dd><StatusPill status={site.status} /></dd>
            <dt>Location</dt><dd>{site.location}</dd>
            <dt>Stage</dt><dd>{site.stage}</dd>
            <dt>Planned</dt><dd>{dates}</dd>
            <dt>Last report</dt><dd>{site.lastReportDate ? `${prettyDate(site.lastReportDate)}, ${site.lastReportTime}` : 'None yet'}</dd>
          </dl>
        </div>
        <div className="card">
          <h3>People</h3>
          <dl className="facts">
            <dt>Foreman</dt><dd>{contact(site.foremanName, site.foremanPhone, site.foremanEmail)}</dd>
            <dt>Client</dt><dd>{site.client ? contact(site.client.name, site.client.phone, site.client.email) : '–'}</dd>
          </dl>
        </div>
      </div>
      {!!low.length && <p className="notice warn" style={{ marginTop: 16 }}>Reorder soon: {low.map((m) => `${m.name} (${m.stock} ${m.unit} left)`).join(', ')}.</p>}
    </>
  );
}

// Who can see this site. Site managers put supervisors and viewers on or off it.
function TeamTab({ cid, sid, site }) {
  const { can } = useAuth();
  const allowed = can('team.manage') || can('sites.manage');
  const { data: members, loading, error } = useQuery(() => cid && allowed && teamQuery(cid), [cid, allowed]);
  const [busy, setBusy] = useState('');
  if (!allowed) return <Empty title="Site team">Ask a project manager or admin to see or change who works on this site.</Empty>;
  if (loading) return <Loading what="the team" />;
  if (error) return <ErrorState error={error} what="the team" />;
  const t = siteTeam(members, sid);
  const manage = can('sites.manage');

  async function toggle(m, assigned) {
    setBusy(m.id);
    try {
      await team.assignToSite({ sid, uid: m.id, assigned });
      toast(`${m.name} ${assigned ? 'added to' : 'removed from'} ${site.name}.`);
    } catch (e) {
      console.error('assignToSite failed', e);
      toast(friendlyError(e), 'err');
    } finally {
      setBusy('');
    }
  }

  const row = (m, action) => (
    <li key={m.id}><span className="it">
      <span className="grow"><b>{m.name}</b><small>{ROLE_LABELS[m.role]}{m.phone ? `, ${m.phone}` : ''}</small></span>{action}
    </span></li>
  );
  const noneToAdd = can('team.manage')
    ? 'Everyone with a site role is already here. Add new people on the Team page.'
    : 'No one else to add. An owner or admin adds new people.';
  return (
    <>
      <h3 className="sub">Working on this site</h3>
      {!t.assigned.length
        ? <Empty title="Nobody is assigned yet.">{manage ? 'Add a site supervisor below so they can send daily reports.' : ''}</Empty>
        : <ul className="list">{t.assigned.map((m) => row(m, manage && <button className="btn sm ghost" disabled={busy === m.id} onClick={() => toggle(m, false)}>Remove</button>))}</ul>}
      {manage && (
        <>
          <h3 className="sub">Add to this site</h3>
          {!t.available.length
            ? <Empty>{noneToAdd}</Empty>
            : <ul className="list">{t.available.map((m) => row(m, <button className="btn sm" disabled={busy === m.id} onClick={() => toggle(m, true)}>Add</button>))}</ul>}
        </>
      )}
      <h3 className="sub">Also sees this site</h3>
      <p className="hint">These roles see every site.</p>
      <ul className="list">{t.allSites.map((m) => row(m, null))}</ul>
    </>
  );
}

function SettingsTab({ cid, sid, site }) {
  const { can } = useAuth();
  const { data: finance } = useDoc(() => can('finance.view') && financeDoc(cid, sid), [cid, sid]);
  const [budget, setBudgetValue] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);

  async function saveDetails(details) {
    const res = await save(updateSiteDetails(cid, sid, details), 'Site details'); // throws a friendly message
    toast(savedText(res, 'Site details'));
  }
  async function changeStatus(status) {
    const closing = `Close ${site.name}? The site team will no longer be able to add reports, attendance or materials. You can reopen it later.`;
    if (status === 'closed' && !window.confirm(closing)) return;
    setStatusBusy(true);
    try {
      await save(setSiteStatus(cid, sid, status), 'Site status');
      toast(`${site.name} is now ${SITE_STATUS_LABELS[status].toLowerCase()}.`);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setStatusBusy(false);
    }
  }
  async function saveBudget(e) {
    e.preventDefault();
    const v = validate(budgetInput, { budget });
    if (!v.ok) return toast(v.error, 'err');
    try {
      await save(setBudget(cid, sid, v.data.budget), 'Budget');
      toast('Budget saved.');
      setBudgetValue('');
    } catch (e2) {
      toast(e2.message, 'err');
    }
  }

  return (
    <>
      <h3 className="sub">Status</h3>
      <div className="seg" role="group" aria-label="Site status">
        {SITE_STATUSES.map((st) => (
          <button key={st} type="button" aria-pressed={site.status === st} disabled={statusBusy || site.status === st} onClick={() => changeStatus(st)}>
            {SITE_STATUS_LABELS[st]}
          </button>
        ))}
      </div>
      <p className="hint">Active: daily reports expected. On hold: work paused, no report reminders. Closed: finished, read-only for the site team.</p>

      <h3 className="sub">Details</h3>
      <SiteForm initial={siteFormValues(site)} submitLabel="Save details" busyLabel="Saving…" onSubmit={saveDetails} />

      {can('finance.view') && (
        <>
          <h3 className="sub">Budget</h3>
          <form className="form inline" onSubmit={saveBudget}>
            <p>Current budget: <b>{finance ? cedi(finance.budget) : '–'}</b></p>
            <div className="field"><label htmlFor="st-b">New budget (GH₵)</label><input id="st-b" type="number" min="0" value={budget} onChange={(e) => setBudgetValue(e.target.value)} /></div>
            <button className="btn ghost">Save budget</button>
          </form>
        </>
      )}
    </>
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
