import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { COUNTRIES, ROLE_LABELS, errorCode, friendlyError } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useTitle } from '../lib/hooks';
import { logOut } from '../lib/account';
import { toast } from '../lib/save';
import {
  adminCompanies, adminCompany, adminFindUser, adminLogList, adminOverview, adminResendInvite, adminSendPasswordReset,
  adminSetCompanyInternal, adminSetCompanySuspended, adminSetLoginDisabled,
} from '../lib/admin';
import Brand from '../components/Brand';
import Choice from '../components/Choice';
import PageHead from '../components/PageHead';
import SearchBox from '../components/SearchBox';
import StatusPill from '../components/StatusPill';
import Tabs from '../components/Tabs';
import { SignupChart, Spark } from '../components/Charts';
import { Empty, Loading } from '../components/States';

// The platform admin's page (the person who runs SiteFlow, not a client's owner): who has signed up,
// who is using SiteFlow, and help for people who are stuck. Everything comes from the admin Cloud
// Functions, which check the platformAdmin claim and answer with counts and dates only, so this page
// never sees a client's reports, photos, issues or money.

const TABS = [['overview', 'Overview'], ['companies', 'Companies'], ['people', 'People'], ['log', 'Admin log']];
const STATUS = { active: ['Active', 'ok'], quiet: ['Going quiet', 'warn'], never: ['Never started', 'calm'] };
const FILTERS = [['all', 'All'], ['active', 'Active'], ['quiet', 'Going quiet'], ['never', 'Never started'], ['internal', 'Internal']];
// Status filters leave internal companies out; they have their own filter
const inFilter = (f, r) => f === 'all' || (f === 'internal' ? r.internal : !r.internal && r.status === f);

const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
// When someone last used SiteFlow, in days
function ago(iso) {
  if (!iso) return 'Never';
  const days = Math.round((midnight(new Date()) - midnight(new Date(iso))) / 86_400_000);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  return days < 30 ? `${days} days ago` : day(iso);
}
const countryName = (code) => COUNTRIES.find((c) => c.code === code)?.name || code;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const newestFirst = (a, b) => (b.createdAt ? Date.parse(b.createdAt) : -Infinity) - (a.createdAt ? Date.parse(a.createdAt) : -Infinity);

// A refusal means the admin claim was taken away: a fresh token then sends the person off this page
function useDenied() {
  const { refreshAdmin } = useAuth();
  return useCallback((e) => { if (errorCode(e) === 'permission-denied') refreshAdmin(); }, [refreshAdmin]);
}

// One admin lookup. It loads once enabled, keeps its answer while it loads again (reload), and
// loads again when its arguments change.
function useLoad(fn, args, enabled = true) {
  const denied = useDenied();
  const [state, setState] = useState({ data: null, loading: enabled, error: null });
  const [round, setRound] = useState(0);
  const key = JSON.stringify(args ?? null);
  const lastKey = useRef(key);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    // Something else asked for (another email): the old answer goes
    const same = lastKey.current === key;
    lastKey.current = key;
    setState((s) => ({ data: same ? s.data : null, loading: true, error: null }));
    fn(args ?? undefined).then(
      (data) => { if (live) setState({ data, loading: false, error: null }); },
      (error) => { console.error('Admin lookup failed', error); if (live) setState({ data: null, loading: false, error }); denied(error); },
    );
    return () => { live = false; };
  }, [key, enabled, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = useCallback(() => setRound((n) => n + 1), []);
  // Just enabled, before the first answer: loading (not an error with nothing in it)
  return { ...state, loading: state.loading || (enabled && !state.data && !state.error), reload };
}

// Actions: ask first (naming who or what, and what will happen), then run, then say how it went
function useAction() {
  const denied = useDenied();
  const [busy, setBusy] = useState('');
  async function run(key, question, fn, done) {
    if (question && !window.confirm(question)) return;
    setBusy(key);
    try {
      done(await fn());
    } catch (e) {
      console.error(key, e);
      toast(friendlyError(e), 'err');
      denied(e);
    } finally {
      setBusy('');
    }
  }
  return { busy, run };
}

// What happened to an email the server tried to send
function emailToast(r, sent, to) {
  if (r?.email === 'sent') toast(sent);
  else if (r?.email === 'skipped') toast('Email is not set up here, so no email went out.', 'warn');
  else toast(`The email to ${to} could not be sent. Try again in a few minutes.`, 'err');
}

function LoadError({ error, what, onRetry }) {
  return (
    <div className="err" role="alert">
      <p><b>Could not load {what}.</b></p>
      <p>{friendlyError(error)}</p>
      {onRetry && <button type="button" className="btn sm ghost mt-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export default function Admin() {
  useTitle('Admin');
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [seen, setSeen] = useState(() => new Set(['overview'])); // tabs opened so far: each loads the first time
  const [stale, setStale] = useState(() => new Set());           // tabs to load again when next opened
  const [openCid, setOpenCid] = useState(null);                  // the company shown in the panel
  const loads = {
    overview: useLoad(adminOverview, null, seen.has('overview')),
    companies: useLoad(adminCompanies, null, seen.has('companies')),
    log: useLoad(adminLogList, null, seen.has('log')),
  };

  function go(t) {
    setTab(t);
    setSeen((s) => (s.has(t) ? s : new Set(s).add(t)));
    if (stale.has(t)) {
      loads[t]?.reload();
      setStale((s) => { const n = new Set(s); n.delete(t); return n; });
    }
  }
  // After an action: the tab on screen loads again now, the others when they are next opened
  function changed(...which) {
    for (const t of which) if (t === tab) loads[t]?.reload();
    const later = which.filter((t) => t !== tab);
    if (later.length) setStale((s) => new Set([...s, ...later]));
  }
  const openCompany = (cid) => { setOpenCid(cid); go('companies'); };

  return (
    <div className="admin">
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <Brand />
        <span className="pill calm">Admin</span>
        <span className="grow" />
        <span className="muted small admin-who">{user?.email}</span>
        <Link to="/" className="btn sm ghost">Open SiteFlow</Link>
        <button type="button" className="btn sm ghost" onClick={logOut}>Sign out</button>
      </header>
      <main id="main" tabIndex={-1}>
        <PageHead title="SiteFlow admin" sub="Who has signed up and who is using SiteFlow. Counts and dates only: no reports, photos, issues or money.">
          {loads[tab] && <button type="button" className="btn sm ghost" disabled={loads[tab].loading} onClick={loads[tab].reload}>{loads[tab].loading ? 'Loading…' : 'Refresh'}</button>}
        </PageHead>
        <div className="dpage">
          <Tabs tabs={TABS} value={tab} onChange={go} label="Admin sections">
            {tab === 'overview' && <Overview load={loads.overview} />}
            {tab === 'companies' && <Companies load={loads.companies} openCid={openCid} onOpen={setOpenCid} onChanged={changed} />}
            {tab === 'people' && <People onOpenCompany={openCompany} onChanged={changed} />}
            {tab === 'log' && <AdminLog load={loads.log} />}
          </Tabs>
        </div>
      </main>
    </div>
  );
}

function Tile({ label, children, foot, spark }) {
  return (
    <div className="tile"><dt>{label}</dt><dd>{children}</dd>
      <div className="foot"><span className="delta nt">{foot}</span>{spark}</div></div>
  );
}

// Totals, new sign-ups and who is active this week, with internal and test companies left out
function Overview({ load }) {
  const { data: o, loading, error, reload } = load;
  if (!o) return loading ? <Loading what="the numbers" /> : <LoadError error={error} what="the numbers" onRetry={reload} />;
  const weeks = o.signupsByWeek || [];
  const total = weeks.reduce((n, w) => n + w.companies, 0);
  return (
    <>
      <dl className="tiles">
        <Tile label="Companies" foot="Internal and test ones left out" spark={<Spark data={weeks.map((w) => w.companies)} />}>{o.companies}</Tile>
        <Tile label="People" foot="Everyone with a login" spark={<Spark data={weeks.map((w) => w.people)} color="var(--c-done)" />}>{o.people}</Tile>
        <Tile label="New this week" foot={`${plural(o.newPeople7, 'new person', 'new people')}, last 7 days`}>{o.newCompanies7}<small> {o.newCompanies7 === 1 ? 'company' : 'companies'}</small></Tile>
        <Tile label="New this month" foot={`${plural(o.newPeople30, 'new person', 'new people')}, last 30 days`}>{o.newCompanies30}<small> {o.newCompanies30 === 1 ? 'company' : 'companies'}</small></Tile>
        <Tile label="Active companies this week" foot="Used SiteFlow in the last 7 days">{o.activeCompanies7}<small> of {o.companies}</small></Tile>
        <Tile label="Active people this week" foot="Opened SiteFlow in the last 7 days">{o.activePeople7}<small> of {o.people}</small></Tile>
      </dl>
      <section className="panel mt" aria-labelledby="signups-h">
        <div className="panel-h">
          <div><h2 id="signups-h">Sign-ups per week</h2><p>New companies and new people over the last 13 weeks</p></div>
          <span className="count">{plural(total, 'company', 'companies')}</span>
        </div>
        <div className="legend2"><span><i style={{ background: 'var(--brass)' }} />Companies</span><span><i style={{ background: 'var(--c-done)' }} />People</span></div>
        <SignupChart weeks={weeks} />
      </section>
    </>
  );
}

// Status and flags of a company, as labels
function CompanyPills({ r }) {
  const [label, kind] = STATUS[r.status] || [r.status, 'calm'];
  return (
    <span className="chips admin-pills">
      <span className={`pill ${kind}`}>{label}</span>
      {r.suspended && <span className="pill bad">Paused</span>}
      {r.internal && <span className="pill calm">Internal</span>}
    </span>
  );
}

// Every company, newest sign-up first. A row opens its details in a panel under the list.
function Companies({ load, openCid, onOpen, onChanged }) {
  const { data, loading, error, reload } = load;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  if (!data) return loading ? <Loading what="companies" /> : <LoadError error={error} what="companies" onRetry={reload} />;
  const rows = [...data.rows].sort(newestFirst);
  const text = q.trim().toLowerCase();
  const shown = rows.filter((r) => inFilter(filter, r) && (!text || (r.name || '').toLowerCase().includes(text)));
  const toggle = (cid) => onOpen(cid === openCid ? null : cid);
  return (
    <>
      <div className="toolbar">
        <Choice className="seg m0" label="Show companies" value={filter} onChange={setFilter}
          options={FILTERS.map(([value, label]) => ({ value, label: `${label} (${rows.filter((r) => inFilter(value, r)).length})` }))} />
        <SearchBox value={q} onChange={setQ} placeholder="Search by company name" label="Search companies"
          onKeyDown={(e) => { if (e.key === 'Escape') setQ(''); }} />
      </div>
      {!rows.length ? <Empty title="No companies yet.">Companies show here as soon as someone signs up.</Empty>
        : !shown.length ? <Empty title="No company matches.">Try another filter or name.</Empty> : (
          <div className="scroll"><table>
            <thead><tr>
              <th>Company</th><th>Country</th><th>Signed up</th><th className="num">People</th><th className="num">Projects</th>
              <th className="num">Reports, 7 days</th><th>Last active</th><th>Status</th>
            </tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={`row${r.id === openCid ? ' picked' : ''}`} onClick={() => toggle(r.id)}>
                  <td>
                    <button type="button" className="linkbtn" aria-expanded={r.id === openCid} onClick={(e) => { e.stopPropagation(); toggle(r.id); }}>{r.name || 'Unnamed company'}</button>
                    <div className="muted small">{[r.ownerName, r.ownerEmail].filter(Boolean).join(', ') || 'No owner found'}</div>
                  </td>
                  <td>{countryName(r.country)}</td>
                  <td>{day(r.createdAt)}</td>
                  <td className="num">{r.people}</td>
                  <td className="num">{r.projects}{r.sampleOnly && <span className="muted small"> (samples only)</span>}</td>
                  <td className="num">{r.reports7d}</td>
                  <td>{ago(r.lastActive)}</td>
                  <td><CompanyPills r={r} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      {openCid && <CompanyPanel key={openCid} cid={openCid} onClose={() => onOpen(null)} onChanged={onChanged} />}
    </>
  );
}

// One company: its numbers, first steps, people and projects (names and dates only), and the actions
function CompanyPanel({ cid, onClose, onChanged }) {
  const detail = useLoad(adminCompany, { cid });
  const { busy, run } = useAction();
  const box = useRef(null);
  useEffect(() => { box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, []);
  const c = detail.data;
  const after = (...tabs) => { detail.reload(); onChanged(...tabs); };

  return (
    <section ref={box} className="panel mt admin-panel" aria-labelledby="co-h">
      {!c ? (
        <>
          <div className="panel-h"><h2 id="co-h">Company</h2><button type="button" className="btn sm ghost" onClick={onClose}>Close</button></div>
          {detail.loading ? <Loading what="the company" /> : <LoadError error={detail.error} what="the company" onRetry={detail.reload} />}
        </>
      ) : (
        <>
          <div className="panel-h">
            <div>
              <h2 id="co-h">{c.name || 'Unnamed company'}</h2>
              <p>{[c.ownerName, c.ownerEmail].filter(Boolean).join(', ') || 'No owner found'} · {countryName(c.country)} · Signed up {day(c.createdAt)}</p>
            </div>
            <button type="button" className="btn sm ghost" onClick={onClose}>Close</button>
          </div>
          <CompanyPills r={c} />
          <dl className="cols mt">
            <div><dt>People</dt><dd>{c.people}</dd></div>
            <div><dt>Projects</dt><dd>{c.projects}{c.sampleOnly && <small className="muted"> samples only</small>}</dd></div>
            <div><dt>Reports, last 7 days</dt><dd>{c.reports7d}</dd></div>
            <div><dt>Last active</dt><dd>{ago(c.lastActive)}</dd></div>
          </dl>
          <div className="actions">
            <button type="button" className="btn ghost danger" disabled={!!busy}
              onClick={() => run('suspend',
                c.suspended ? `Unpause ${c.name}? Its people can open it again straight away.` : `Pause ${c.name}? Its people can't open it until you unpause it.`,
                () => adminSetCompanySuspended({ cid, on: !c.suspended }),
                () => { toast(c.suspended ? `${c.name} unpaused.` : `${c.name} paused.`); after('companies', 'log'); })}>
              {busy === 'suspend' ? 'Working…' : c.suspended ? 'Unpause company' : 'Pause company'}
            </button>
            <button type="button" className="btn ghost" disabled={!!busy}
              onClick={() => run('internal',
                c.internal ? `Count ${c.name} again? It goes back into every count and chart.` : `Mark ${c.name} as internal or test? It is left out of every count and chart.`,
                () => adminSetCompanyInternal({ cid, on: !c.internal }),
                () => { toast(c.internal ? `${c.name} is counted again.` : `${c.name} marked as internal.`); after('companies', 'overview', 'log'); })}>
              {busy === 'internal' ? 'Working…' : c.internal ? 'Count it again' : 'Mark as internal or test'}
            </button>
          </div>
          <p className="hint">Pausing stops its people opening the company and stops its emails and reminders. People in other companies keep those.</p>

          <h3 className="sub">Getting started</h3>
          <ul className="chips admin-steps">
            {c.steps.map((s) => <li key={s.key} className={`pill ${s.done ? 'ok' : 'calm'}`}>{s.done ? `✓ ${s.title}` : `${s.title}: not yet`}</li>)}
          </ul>

          <h3 className="sub">People</h3>
          {!c.members.length ? <Empty title="Nobody in this company." /> : (
            <div className="scroll"><table>
              <thead><tr><th>Name</th><th>Role</th><th>Last active</th><th /></tr></thead>
              <tbody>
                {c.members.map((m) => (
                  <tr key={m.id}>
                    <td><b>{m.name || m.email}</b><div className="muted small">{m.email}</div>
                      {(m.invitePending || m.disabled) && <span className="chips mt-xs">
                        {m.invitePending && <span className="pill warn">Invited, waiting</span>}
                        {m.disabled && <span className="pill bad">Login switched off</span>}
                      </span>}</td>
                    <td>{ROLE_LABELS[m.role] || m.role}</td>
                    <td>{ago(m.lastActive)}</td>
                    <td><PersonActions person={m} cid={cid} company={c.name} onDone={() => after('log')} /></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}

          <h3 className="sub">Projects</h3>
          {!c.projectList.length ? <Empty title="No projects yet." /> : (
            <div className="scroll"><table>
              <thead><tr><th>Project</th><th>Status</th><th>Last report</th></tr></thead>
              <tbody>
                {c.projectList.map((p) => (
                  <tr key={p.id}>
                    <td><b>{p.name || 'Unnamed project'}</b> {p.sample && <span className="pill sample">Sample</span>}</td>
                    <td>{p.status ? <StatusPill status={p.status} /> : '–'}</td>
                    <td>{p.lastReportDate ? day(`${p.lastReportDate}T12:00:00`) : 'None yet'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </>
      )}
    </section>
  );
}

// Help for one person: a new invitation (when they haven't accepted), a password link, or their login
// switched off or on. cid and company are set when they are shown inside a company.
function PersonActions({ person: p, cid, company, onDone }) {
  const { user } = useAuth();
  const { busy, run } = useAction();
  const who = p.name || p.email;
  return (
    <div className="actions admin-acts">
      {cid && p.invitePending && (
        <button type="button" className="btn sm ghost" disabled={!!busy}
          onClick={() => run('invite', `Send ${who} a new invitation to ${company}? It goes to ${p.email}.`,
            () => adminResendInvite({ cid, uid: p.id }),
            (r) => { emailToast(r, `New invitation sent to ${p.email}.`, p.email); onDone(); })}>
          {busy === 'invite' ? 'Sending…' : 'Resend invitation'}
        </button>
      )}
      {p.email && (
        <button type="button" className="btn sm ghost" disabled={!!busy}
          onClick={() => run('reset', `Email ${who} a link to set a new password? It goes to ${p.email}.`,
            () => adminSendPasswordReset({ uid: p.id }),
            (r) => { emailToast(r, `Password link sent to ${p.email}.`, p.email); onDone(); })}>
          {busy === 'reset' ? 'Sending…' : 'Send password link'}
        </button>
      )}
      {p.id !== user?.uid && (
        <button type="button" className={`btn sm ghost${p.disabled ? '' : ' danger'}`} disabled={!!busy}
          onClick={() => run('login',
            p.disabled ? `Switch ${who}'s login back on? They can sign in again.` : `Switch off ${who}'s login? They can't sign in to any company.`,
            () => adminSetLoginDisabled({ uid: p.id, disabled: !p.disabled }),
            () => { toast(p.disabled ? `${who}'s login is switched on.` : `${who}'s login is switched off.`); onDone(); })}>
          {busy === 'login' ? 'Working…' : p.disabled ? 'Switch login on' : 'Switch login off'}
        </button>
      )}
    </div>
  );
}

// Look someone up by email: their login, the companies they belong to, and the actions
function People({ onOpenCompany, onChanged }) {
  const [email, setEmail] = useState('');
  const [asked, setAsked] = useState('');
  const found = useLoad(adminFindUser, { email: asked }, !!asked);
  function find(e) {
    e.preventDefault();
    const v = email.trim();
    if (!v) return;
    if (v === asked) found.reload(); else setAsked(v);
  }
  const u = found.data?.user;
  return (
    <>
      <form className="actions mt" onSubmit={find}>
        <SearchBox value={email} onChange={setEmail} placeholder="Their email address" label="Email address" />
        <button type="submit" className="btn" disabled={found.loading && !!asked}>Find</button>
      </form>
      <div className="mt">
        {!asked ? <p className="hint">Type the email address someone signs in with.</p>
          : found.loading && !found.data ? <Loading what="that person" />
          : found.error ? <LoadError error={found.error} what="that person" />
          : !u ? <Empty title={`Nobody signs in with ${asked}.`}>Check the spelling, or ask them which email address they used.</Empty> : (
            <section className="panel admin-panel" aria-labelledby="person-h">
              <div className="panel-h">
                <div><h2 id="person-h">{u.name || u.email}</h2><p>{u.email}</p></div>
                {u.disabled && <span className="pill bad">Login switched off</span>}
              </div>
              <dl className="cols mt">
                <div><dt>Signed up</dt><dd>{day(u.createdAt)}</dd></div>
                <div><dt>Last active</dt><dd>{ago(u.lastActive)}</dd></div>
                <div><dt>Companies</dt><dd>{u.companies.length}</dd></div>
              </dl>
              {!u.companies.length ? <p className="hint">Not in any company yet (they haven't finished signing up).</p> : (
                <ul className="list">
                  {u.companies.map((c) => (
                    <li key={c.id}><span className="it">
                      <span className="grow"><b>{c.name || 'Unnamed company'}</b><small>{ROLE_LABELS[c.role] || c.role}</small></span>
                      <button type="button" className="btn sm ghost" onClick={() => onOpenCompany(c.id)}>Open company</button>
                    </span></li>
                  ))}
                </ul>
              )}
              <PersonActions person={u} onDone={() => { found.reload(); onChanged('log'); }} />
            </section>
          )}
      </div>
    </>
  );
}

// The latest 100 things done from this page, newest first
function AdminLog({ load }) {
  const { data, loading, error, reload } = load;
  if (!data) return loading ? <Loading what="the admin log" /> : <LoadError error={error} what="the admin log" onRetry={reload} />;
  if (!data.entries.length) return <Empty title="Nothing done here yet.">Password links, paused companies and the other actions on this page are listed here.</Empty>;
  return (
    <>
      <div className="scroll"><table>
        <thead><tr><th>What</th><th>Who</th><th>When</th></tr></thead>
        <tbody>
          {data.entries.map((e) => (
            <tr key={e.id}>
              <td><b>{e.action.charAt(0).toUpperCase() + e.action.slice(1)}</b><div className="muted small">{e.target}</div></td>
              <td>{e.who}</td>
              <td>{when(e.at)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="hint mt-sm">The latest 100 actions. They are not shown to the companies.</p>
    </>
  );
}
