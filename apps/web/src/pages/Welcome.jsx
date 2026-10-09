import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MODULES, assignableRoles, companySettingsInput, friendlyError, isOn, validate } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useQuery, useTitle } from '../lib/hooks';
import { companyDoc, sitesCol, updateCompany } from '../lib/db';
import { loadDemo, setModule } from '../lib/account';
import { save, toast } from '../lib/save';
import Brand from '../components/Brand';
import { InviteForm, IssuedLogin } from '../components/Invite';
import { ErrorState, Loading } from '../components/States';

const STEPS = ['Your company', 'Features', 'Your team', 'First project'];

// Setting up a new company, one step at a time. Every step can be skipped and done later
// from Company, Modules or Team.
export default function Welcome() {
  useTitle('Set up SiteFlow');
  const { cid, role, profile } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const { data: company, loading, error } = useDoc(() => cid && companyDoc(cid), [cid]);
  const { data: sites } = useQuery(() => cid && sitesCol(cid), [cid]);
  if (loading) return <Loading what="your company" />;
  if (error || !company) return <section className="wrap narrow"><ErrorState error={error} what="your company" /></section>;
  const next = () => (step < STEPS.length - 1 ? setStep(step + 1) : nav('/'));

  return (
    <section className="wrap narrow welcome">
      <Brand big />
      <h1>Welcome to SiteFlow{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}</h1>
      <p className="muted lead">A few minutes now and {company.name} is ready for its first project. Skip anything and come back to it later.</p>
      <ol className="wsteps" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <button type="button" onClick={() => setStep(i)}><span>{i < step ? '✓' : i + 1}</span>{s}</button>
          </li>
        ))}
      </ol>
      <div className="card">
        {step === 0 && <CompanyStep cid={cid} company={company} onDone={next} />}
        {step === 1 && <FeaturesStep company={company} onDone={next} />}
        {step === 2 && <TeamStep role={role} sites={sites} onDone={next} />}
        {step === 3 && <ProjectStep sites={sites} />}
      </div>
      <p className="mt small"><Link to="/">Skip setup and go to the dashboard</Link></p>
    </section>
  );
}

function CompanyStep({ cid, company, onDone }) {
  const [f, setF] = useState({ name: company.name || '', phone: company.phone || '', location: company.location || '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const v = validate(companySettingsInput, f);
    if (!v.ok) return setErr(v.error);
    setBusy(true); setErr('');
    try { await save(updateCompany(cid, v.data), 'Company details'); onDone(); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }
  return (
    <form className="form" onSubmit={submit}>
      <h2>Your company</h2>
      <p className="muted mb">Shown on reports, reminders and the messages your team receives.</p>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="field"><label htmlFor="w-n">Company name</label><input id="w-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="grid2">
        <div className="field"><label htmlFor="w-p">Office phone</label><input id="w-p" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="030 000 0000" /></div>
        <div className="field"><label htmlFor="w-l">Office location</label><input id="w-l" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="e.g. East Legon, Accra" /></div>
      </div>
      <div className="actions"><button type="submit" className="btn gold" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
        <button type="button" className="btn ghost" onClick={onDone}>Skip</button></div>
    </form>
  );
}

function FeaturesStep({ company, onDone }) {
  const [busy, setBusy] = useState('');
  const ready = MODULES.filter((m) => m.ready && m.tier !== 'core');
  async function flip(m, on) {
    setBusy(m.key);
    try { await setModule({ key: m.key, on }); } catch (e) { toast(friendlyError(e), 'err'); } finally { setBusy(''); }
  }
  return (
    <div>
      <h2>Choose your features</h2>
      <p className="muted mb">Daily reports and photos are always on. Switch on what your sites need; you can change this any time under Modules.</p>
      <ul className="list">
        {ready.map((m) => (
          <li key={m.key}><div className="it">
            <span className="grow"><b>{m.name}</b><small>{m.description}</small></span>
            <label className="switch"><input type="checkbox" aria-label={m.name} checked={isOn(company, m.key)} disabled={!!busy} onChange={(e) => flip(m, e.target.checked)} /><span /></label>
          </div></li>
        ))}
      </ul>
      <p className="hint mt-sm">More modules (drawings, RFIs, change orders, inspections, safety and others) are on the way. See them under Modules.</p>
      <div className="actions mt"><button type="button" className="btn gold" onClick={onDone}>Continue</button></div>
    </div>
  );
}

function TeamStep({ role, sites, onDone }) {
  const [issued, setIssued] = useState(null);
  return (
    <div>
      <h2>Bring in your team</h2>
      <p className="muted">Add a project manager, your accounts person or a foreman. Each person gets a login to share with them on WhatsApp.
        Foremen and supervisors only see the projects you give them, so you can also add them once your first project exists.</p>
      {issued && <IssuedLogin issued={issued} onDone={() => setIssued(null)} />}
      <InviteForm roles={assignableRoles(role)} sites={sites.filter((s) => s.status !== 'closed')} onInvited={setIssued} />
      <div className="actions mt"><button type="button" className="btn gold" onClick={onDone}>Continue</button>
        <button type="button" className="btn ghost" onClick={onDone}>Skip for now</button></div>
    </div>
  );
}

function ProjectStep({ sites }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const hasSamples = sites.some((s) => s.sample);
  async function demo() {
    setBusy(true);
    try { await loadDemo(); toast('Sample projects added. Remove them any time from the dashboard or Company.'); nav('/'); }
    catch (e) { setBusy(false); toast(friendlyError(e), 'err'); }
  }
  return (
    <div>
      <h2>Your first project</h2>
      <p className="muted mb">Set up a real project now, or look around with sample projects first.</p>
      <div className="choices">
        <Link to="/sites/new" className="choice">
          <b>Add your first project</b>
          <span>Name, location, type of work, foreman and budget. About two minutes.</span>
        </Link>
        <button type="button" className="choice" onClick={demo} disabled={busy || hasSamples}>
          <b>{hasSamples ? 'Sample projects are loaded' : busy ? 'Adding sample projects…' : 'Explore with sample data'}</b>
          <span>Three sample projects (a house, an office block and a road job) with six weeks of reports, photos, workers, materials and spending. Labelled Sample, never send messages, and removed in one click.</span>
        </button>
      </div>
    </div>
  );
}
