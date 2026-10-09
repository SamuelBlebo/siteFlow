import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ALERT_LABELS, alertCounts, rankAlerts, waPhone } from '@siteflow/shared';

const SHOW = 8;

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
        <span className="count">{alerts.length} open</span>
      </div>
      {!alerts.length ? <p className="empty mt-sm">All clear. Nothing needs your attention right now.</p> : (
        <>
          {counts.length > 1 && (
            <div className="chips mt-sm" role="group" aria-label="Filter alerts">
              <button type="button" className={`chip ${!kind ? 'on' : ''}`} aria-pressed={!kind} onClick={() => setKind('')}>All ({alerts.length})</button>
              {counts.map((c) => <button key={c.kind} type="button" className={`chip ${kind === c.kind ? 'on' : ''}`} aria-pressed={kind === c.kind} onClick={() => setKind(c.kind)}>{c.label} ({c.count})</button>)}
            </div>
          )}
          <ul className="alist">
            {visible.map((a, i) => (
              <li key={`${a.site.id}-${a.kind}-${i}`} className={a.severity}>
                <span className={`sev ${a.severity}`} aria-hidden="true" />
                <div className="body">
                  <b>{a.title}</b> <span className="muted">at</span> <Link className="linkbtn" to={`/sites/${a.site.id}${a.tab ? `?tab=${a.tab}` : ''}`}>{a.site.name}</Link>
                  <p><span className="visually-hidden">{a.severity === 'bad' ? 'Urgent. ' : ''}{ALERT_LABELS[a.kind] || a.kind}: </span>{a.detail}</p>
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
  if (a.kind === 'report' && a.site.foremanPhone) {
    const text = `Hi ${a.site.foremanName || ''}, please send today's SiteFlow report for ${a.site.name}.`;
    return <a className="btn sm ghost" target="_blank" rel="noreferrer" href={`https://wa.me/${waPhone(a.site.foremanPhone)}?text=${encodeURIComponent(text)}`}>Remind on WhatsApp</a>;
  }
  if (a.kind === 'issue') return <Link className="btn sm ghost" to={`/issues?site=${a.site.id}`}>See issue</Link>;
  if (a.kind === 'stock' || a.kind === 'usage') return <Link className="btn sm ghost" to={`/sites/${a.site.id}?tab=materials`}>Materials</Link>;
  if (a.kind === 'budget') return <Link className="btn sm ghost" to={`/sites/${a.site.id}?tab=budget`}>Budget</Link>;
  if (a.kind === 'schedule') return <Link className="btn sm ghost" to={`/sites/${a.site.id}?tab=progress`}>Progress</Link>;
  return null;
}
