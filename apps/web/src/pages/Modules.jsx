import { useState } from 'react';
import { MODULES, PLAN_LABELS, TIER_LABELS, friendlyError, isOn, planFor } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useDoc, useTitle } from '../lib/hooks';
import { companyDoc } from '../lib/db';
import { setModule } from '../lib/account';
import { toast } from '../lib/save';
import PageHead from '../components/PageHead';
import { ErrorState, Loading } from '../components/States';

// Owner: switch features on or off for the whole company. Data is kept when a module is off.
export default function Modules() {
  useTitle('Modules');
  const { cid } = useAuth();
  const { data: company, loading, error } = useDoc(() => cid && companyDoc(cid), [cid]);
  const [busy, setBusy] = useState('');

  if (loading) return <Loading what="modules" />;
  if (error || !company) return <section className="wrap"><ErrorState error={error} what="your modules" /></section>;

  const plan = PLAN_LABELS[company.plan] || PLAN_LABELS[planFor(company.modules || {})];
  // Only built modules count as on (a module that is still coming soon does nothing yet)
  const live = (m) => (m.tier === 'core' || m.ready) && isOn(company, m.key);
  const count = MODULES.filter(live).length;
  async function flip(m, on) {
    setBusy(m.key);
    try {
      await setModule({ key: m.key, on });
      toast(on ? `${m.name} turned on for everyone.` : `${m.name} turned off. Its data is kept.`);
    } catch (e) {
      console.error('Module switch failed', e);
      toast(friendlyError(e), 'err');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <PageHead title="Modules" sub="Switch features on or off for your whole company. Data is kept when a module is off." />
      <div className="dpage">
        <div className="planbar">
          <div><b>{plan} plan</b><p>{count} module{count === 1 ? '' : 's'} on. Your plan follows the modules you use.</p></div>
        </div>
        <div className="modgrid">
          {MODULES.map((m) => {
            const on = live(m);
            return (
              <div key={m.key} className={`mod ${on ? 'on' : ''} ${m.ready ? '' : 'soon'}`}>
                <div className="mod-h">
                  <span className={`tier t-${m.tier}`}>{TIER_LABELS[m.tier]}</span>
                  {m.tier === 'core' ? <span className="muted small">Always on</span>
                    : m.ready ? (
                      <label className="switch" title={`${on ? 'Turn off' : 'Turn on'} ${m.name}`}>
                        <input type="checkbox" checked={on} disabled={!!busy} aria-label={m.name} onChange={(e) => flip(m, e.target.checked)} /><span />
                      </label>
                    ) : <span className="pill warn">Coming soon</span>}
                </div>
                <h3>{m.name}</h3>
                <p className="muted small">{m.description}</p>
                {busy === m.key && <p className="small muted" role="status">Saving…</p>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
