import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ALERT_LABELS, alertCounts, rankAlerts, waPhone } from '@siteflow/shared';

const SHOW = 6;

// What needs attention across sites: most urgent first, filter by kind, with a direct action where there is one
export default function AlertsPanel({ alerts, className = '' }) {
  const [kind, setKind] = useState('');
  const [all, setAll] = useState(false);
  const ranked = rankAlerts(alerts);
  const counts = alertCounts(alerts);
  const shown = ranked.filter((a) => !kind || a.kind === kind);
  const visible = all ? shown : shown.slice(0, SHOW);
  const bad = alerts.filter((a) => a.severity === 'bad').length;

  return (
    <section className={`panel ${className}`} id="attention" aria-labelledby="alerts-h" tabIndex={-1}>
      <div className="panel-h">
        <div><h2 id="alerts-h">Needs your attention</h2><p>Flagged automatically from today's site activity{bad ? `, ${bad} urgent` : ''}</p></div>
        <span className="a-count">{alerts.length} open</span>
      </div>
      {!alerts.length ? <p className="empty mt-sm">All clear. Nothing needs your attention right now.</p> : (
        <>
          {counts.length > 1 && (
            <div className="afilter" role="group" aria-label="Filter alerts">
              <button type="button" aria-pressed={!kind} onClick={() => setKind('')}>All <span>{alerts.length}</span></button>
              {counts.map((c) => <button key={c.kind} type="button" aria-pressed={kind === c.kind} onClick={() => setKind(c.kind)}>{c.label} <span>{c.count}</span></button>)}
            </div>
          )}
          <ul className="alist">
            {visible.map((a, i) => (
              <li key={`${a.site.id}-${a.kind}-${i}`} className={a.severity}>
                <span className={`sev ${a.severity}`} aria-hidden="true" />
                {/* Two quiet lines: what, then where and why */}
                <div className="body">
                  <b title={a.title}>{a.title}</b>
                  <p><span className="visually-hidden">{a.severity === 'bad' ? 'Urgent. ' : ''}{ALERT_LABELS[a.kind] || a.kind}: </span>
                    <Link className="a-site" to={`/sites/${a.site.id}${a.tab ? `?tab=${a.tab}` : ''}`}>{a.site.name}</Link>{a.detail ? <> · {a.detail}</> : null}</p>
                </div>
                <Action a={a} />
              </li>
            ))}
          </ul>
          {shown.length > SHOW && <button type="button" className="linkbtn mt-sm" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${shown.length}`}</button>}
        </>
      )}
    </section>
  );
}

function Action({ a }) {
  if (a.kind === 'report') {
    const text = `Hi ${a.site.foremanName || ''}, please send today's SiteFlow report for ${a.site.name}.`;
    return (
      <span className="actions">
        <Link className="btn sm ghost" to={`/sites/${a.site.id}?tab=reports&request=1`}>Request report</Link>
        {a.site.foremanPhone && <a className="btn sm ghost" target="_blank" rel="noreferrer" href={`https://wa.me/${waPhone(a.site.foremanPhone)}?text=${encodeURIComponent(text)}`}>WhatsApp foreman</a>}
      </span>
    );
  }
  if (a.kind === 'issue') return <Link className="btn sm ghost" to={`/issues?site=${a.site.id}`}>See issue</Link>;
  if (a.kind === 'stock' || a.kind === 'usage') return <Link className="btn sm ghost" to={`/sites/${a.site.id}?tab=resources&view=materials`}>Materials</Link>;
  if (a.kind === 'budget') return <Link className="btn sm ghost" to={`/sites/${a.site.id}?tab=money`}>Budget</Link>;
  if (a.kind === 'schedule') return <Link className="btn sm ghost" to={`/sites/${a.site.id}?tab=progress&view=programme`}>Progress</Link>;
  return null;
}
