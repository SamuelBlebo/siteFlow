import { useEffect, useState } from 'react';
import { MODULES, companySettingsInput, isOn, planFor, validate } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useQuery } from '../lib/hooks';
import { companyDoc, teamQuery, updateCompany } from '../lib/db';
import { save, savedText } from '../lib/save';
import { ErrorState, Loading } from '../components/States';
import { NotificationSettings } from '../components/Notifications';

const PLAN_LABEL = { starter: 'Starter', professional: 'Professional', enterprise: 'Enterprise' };

// Company settings: owner only (the rules allow nobody else to change them)
export default function Company() {
  const { cid } = useAuth();
  const { data: company, loading, error } = useDoc(() => cid && companyDoc(cid), [cid]);
  const { data: members } = useQuery(() => cid && teamQuery(cid), [cid]);
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
    <section className="wrap narrow">
      <h1>Company</h1>
      <dl className="cols" style={{ marginTop: 16 }}>
        <div><dt>Plan</dt><dd>{PLAN_LABEL[company.plan] || PLAN_LABEL[planFor(company.modules || {})]}</dd></div>
        <div><dt>Team members</dt><dd>{active}</dd></div>
      </dl>

      <h2 className="sub">Company details</h2>
      <form className="form card" onSubmit={submit}>
        {msg.text && <p className={msg.kind === 'err' ? 'err' : 'notice ok'} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
        <div className="field"><label htmlFor="c-n">Company name</label><input id="c-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid2">
          <div className="field"><label htmlFor="c-p">Phone</label><input id="c-p" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="030 000 0000" /></div>
          <div className="field"><label htmlFor="c-l">Office location</label><input id="c-l" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="e.g. East Legon, Accra" /></div>
        </div>
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save company details'}</button>
      </form>

      <h2 className="sub">Notifications</h2>
      <NotificationSettings cid={cid} company={company} />

      <h2 className="sub">Features on your plan</h2>
      <ul className="list">
        {on.map((m) => <li key={m.key}><span className="it"><span className="grow"><b>{m.name}</b><small>{m.description}</small></span></span></li>)}
      </ul>
      <p className="hint" style={{ marginTop: 8 }}>To change your plan or features, contact SiteFlow support.</p>
    </section>
  );
}
