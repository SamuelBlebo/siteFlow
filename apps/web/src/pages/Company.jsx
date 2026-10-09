import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MODULES, PLAN_LABELS, companyLocale, companyLocaleInput, companySettingsInput, friendlyError, getLocale, isOn, planFor, validate } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useQuery, useTitle } from '../lib/hooks';
import { companyDoc, sitesCol, teamQuery, updateCompany, updateCompanyLocale } from '../lib/db';
import CountryFields from '../components/CountryFields';
import { loadDemo, removeDemo } from '../lib/account';
import { toast } from '../lib/save';
import { save, savedText } from '../lib/save';
import { ErrorState, Loading } from '../components/States';
import PageHead from '../components/PageHead';

// Company settings: owner only (the rules allow nobody else to change them)
export default function Company() {
  useTitle('Company');
  const { cid } = useAuth();
  const { data: company, loading, error } = useDoc(() => cid && companyDoc(cid), [cid]);
  const { data: members } = useQuery(() => cid && teamQuery(cid), [cid]);
  const { data: sites } = useQuery(() => cid && sitesCol(cid), [cid]);
  const [demoBusy, setDemoBusy] = useState(false);
  const hasSamples = sites.some((s) => s.sample);
  async function demo() {
    if (hasSamples && !window.confirm('Remove the three sample projects and everything in them? Your own projects are not touched.')) return;
    setDemoBusy(true);
    try {
      if (hasSamples) { const r = await removeDemo(); toast(`Sample projects removed (${r.removed}).`); }
      else { await loadDemo(); toast('Sample projects added. They are labelled Sample and never send messages.'); }
    } catch (e) { toast(friendlyError(e), 'err'); } finally { setDemoBusy(false); }
  }
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (company && !f) setF({ name: company.name || '', phone: company.phone || '', location: company.location || '' }); }, [company, f]);

  if (loading || (company && !f)) return <Loading what="company" />;
  if (error || !company) return <section className="wrap narrow"><ErrorState error={error} what="your company" /></section>;

  async function submit(e) {
    e.preventDefault();
    const v = validate(companySettingsInput, f);
    if (!v.ok) return setMsg({ kind: 'err', text: v.error });
    setBusy(true); setMsg({});
    try {
      const res = await save(updateCompany(cid, v.data), 'Company details');
      setMsg({ kind: 'ok', text: savedText(res, 'Company details') });
    } catch (e2) {
      setMsg({ kind: 'err', text: e2.message });
    } finally {
      setBusy(false);
    }
  }

  const active = members.filter((m) => m.active !== false).length;
  const on = MODULES.filter((m) => isOn(company, m.key));
  return (
    <>
    <PageHead title="Company" sub="Your company's details, plan and settings" />
    <section className="wrap narrow">
      <dl className="cols">
        <div><dt>Plan</dt><dd>{PLAN_LABELS[company.plan] || PLAN_LABELS[planFor(company.modules || {})]}</dd></div>
        <div><dt>Modules on</dt><dd>{on.length}</dd></div>
        <div><dt>Team members</dt><dd>{active}</dd></div>
      </dl>

      <h2 className="sub">Company details</h2>
      <form className="form card" onSubmit={submit}>
        {msg.text && <p className={msg.kind === 'err' ? 'err' : 'notice ok'} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
        <div className="field"><label htmlFor="c-n">Company name</label><input id="c-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid2">
          <div className="field"><label htmlFor="c-p">Phone</label><input id="c-p" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder={getLocale().phoneExample} /></div>
          <div className="field"><label htmlFor="c-l">Office location</label><input id="c-l" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder={`e.g. ${getLocale().cities[1]}`} /></div>
        </div>
        <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save company details'}</button>
      </form>

      <h2 className="sub">Country, currency and time zone</h2>
      <LocaleCard cid={cid} company={company} />

      <h2 className="sub">Settings</h2>
      <ul className="list">
        <li><Link className="it" to="/modules"><span className="grow"><b>Modules</b><small>Switch features on or off. {on.length} on now.</small></span><span aria-hidden="true">›</span></Link></li>
        <li><Link className="it" to="/reminders"><span className="grow"><b>Reminders and alerts</b><small>Which messages go out by WhatsApp and email, and the message log.</small></span><span aria-hidden="true">›</span></Link></li>
        <li><Link className="it" to="/team"><span className="grow"><b>Team</b><small>People, roles and the projects they work on.</small></span><span aria-hidden="true">›</span></Link></li>
        <li><Link className="it" to="/welcome"><span className="grow"><b>Setup steps</b><small>Go through the first-time setup again.</small></span><span aria-hidden="true">›</span></Link></li>
      </ul>

      <h2 className="sub">Sample projects</h2>
      <div className="card">
        <p className="muted">{hasSamples ? 'Three sample projects are in your account. Removing them deletes only the sample projects and everything in them.'
          : 'Add three sample projects with six weeks of reports, photos, workers, materials and spending, to see what SiteFlow does. They are labelled Sample and never send messages.'}</p>
        <button type="button" className={`btn ${hasSamples ? 'ghost' : 'gold'} mt-sm`} onClick={demo} disabled={demoBusy}>
          {demoBusy ? (hasSamples ? 'Removing…' : 'Adding… about 20 seconds') : hasSamples ? 'Remove sample projects' : 'Add sample projects'}</button>
      </div>
    </section>
    </>
  );
}

// Where the company works: money, dates, reminder times and phone numbers follow it
function LocaleCard({ cid, company }) {
  const start = () => { const l = companyLocale(company); return { country: l.country, currency: l.currency, timeZone: l.timeZone }; };
  const [f, setF] = useState(start);
  const [busy, setBusy] = useState(false);
  const changed = JSON.stringify(f) !== JSON.stringify(start());
  async function submit(e) {
    e.preventDefault();
    const v = validate(companyLocaleInput, f);
    if (!v.ok) return toast(v.error, 'err');
    setBusy(true);
    try { await save(updateCompanyLocale(cid, v.data), 'Country settings'); toast('Saved. Money, dates and reminders now follow these settings.'); }
    catch (e2) { toast(e2.message, 'err'); } finally { setBusy(false); }
  }
  return (
    <form className="form card" onSubmit={submit}>
      <p className="muted mb">Money is shown in this currency, "today" and the reminder times (6 pm missing reports, Friday 5 pm summary) follow this time zone,
        and phone numbers typed without a country code get this country's code. Amounts already entered are not converted.</p>
      <CountryFields value={f} onChange={setF} idPrefix="co" />
      <button type="submit" className="btn" disabled={busy || !changed}>{busy ? 'Saving…' : 'Save country settings'}</button>
    </form>
  );
}
