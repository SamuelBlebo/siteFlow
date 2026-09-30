import { Link } from 'react-router-dom';
import { waPhone } from '@siteflow/shared';

const LABEL = { report: 'Report', usage: 'Usage', stock: 'Stock', budget: 'Budget', co: 'Change order', rfi: 'RFI', schedule: 'Programme', safety: 'Safety' };

export default function AlertsPanel({ alerts }) {
  return (
    <section className="alerts" aria-labelledby="alerts-h">
      <h2 id="alerts-h">Needs your attention <span className="count">{alerts.length}</span></h2>
      {!alerts.length ? (
        <p style={{ marginTop: 10 }}>Nothing needs your attention right now.</p>
      ) : (
        <ul>
          {alerts.map((a, i) => (
            <li key={i}>
              <span className={`kind k-${a.kind}`}>{LABEL[a.kind]}</span>
              <div className="body">
                <b>{a.title}</b> at <Link to={`/sites/${a.site.id}`}>{a.site.name}</Link>
                <p className="muted">{a.detail}</p>
              </div>
              {a.kind === 'report' && a.site.foremanPhone && (
                <a className="btn sm ghost" target="_blank" rel="noreferrer"
                   href={`https://wa.me/${waPhone(a.site.foremanPhone)}?text=${encodeURIComponent(`Hi ${a.site.foremanName || ''}, please send today's SiteFlow report for ${a.site.name}.`)}`}>
                  Remind on WhatsApp
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
