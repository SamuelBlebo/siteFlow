import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { friendlyError, isOn } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { aiOverview } from '../lib/account';

// AI overview at the top of a project's Overview (kind "project") or Today (kind "today") tab.
// Written on the server from the project's records and kept until something changes; Refresh
// writes it again. stamp: changes when today's report or progress changes, so the card asks again.
export default function AiOverview({ site, kind, stamp }) {
  const { company, can } = useAuth();
  const on = isOn(company, 'ai');
  const [state, setState] = useState({ loading: true });
  const load = (refresh = false) => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    aiOverview({ siteId: site.id, kind, refresh })
      .then((r) => setState({ loading: false, ...r }))
      .catch((e) => setState({ loading: false, error: friendlyError(e, 'The overview could not be written just now.') }));
  };
  useEffect(() => { if (on) load(); }, [on, site.id, kind, stamp]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!on) {
    return can('company.settings')
      ? <p className="ai-off small">Get a written summary of this project{kind === 'today' ? '’s day' : ''}: switch on <Link to="/modules">SiteFlow AI</Link>.</p>
      : null;
  }
  const time = state.generatedAt ? new Date(state.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <section className="ai-card" aria-live="polite" aria-busy={state.loading}>
      <div className="ai-head">
        <span className="ai-badge" aria-hidden="true">✦</span>
        <h3>{kind === 'today' ? 'Today, in brief' : 'AI overview'}</h3>
        <button type="button" className="linkish" onClick={() => load(true)} disabled={state.loading}>{state.loading ? 'Writing…' : 'Refresh'}</button>
      </div>
      {state.error ? <p className="err small">{state.error}</p>
        : state.loading && !state.text ? <div className="ai-skeleton" aria-label="Writing the overview"><span /><span /><span /></div>
          : <p className="ai-text">{state.text}</p>}
      {state.text && (
        <p className="ai-foot">{state.source === 'ai' ? 'Written by AI' : 'Written automatically'} from this project’s reports, progress and issues{time ? `, ${time}` : ''}. Check anything important against the records.</p>
      )}
    </section>
  );
}
