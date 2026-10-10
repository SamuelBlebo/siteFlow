import { todayKey } from '@siteflow/shared';
import { MyRequests } from './ReportRequests';
import MaterialsTable from './MaterialsTable';

// The project's Today tab: what the site team does each day (attendance, materials, the report),
// with what is already done ticked off, and any report someone has asked them for.
export default function TodayPanel({ cid, site, data, mod, work, onGo }) {
  const usedToday = Object.keys(data.usage).length > 0;
  const sent = site.lastReportDate === todayKey();
  const steps = [
    mod('labour') && { tab: 'labour', done: data.presentCount > 0, title: 'Mark attendance', note: data.presentCount ? `${data.presentCount} workers present` : 'Tick who came to site today' },
    mod('materials') && { tab: 'materials', done: usedToday, title: 'Log materials used', note: usedToday ? 'Usage logged today' : 'Record what was used today' },
    { tab: 'reports', done: sent, title: 'Send daily report', note: sent ? `Sent at ${site.lastReportTime}` : 'Progress, photos and issues' },
  ].filter(Boolean);
  return (
    <>
      <MyRequests cid={cid} site={site} />
      {!work && <p className="notice warn">You can view this project but not add to it.</p>}
      <ol className="steps">
        {steps.map((s) => (
          <li key={s.tab} className={s.done ? 'done' : ''}>
            <button type="button" onClick={() => onGo(s.tab, s.tab === 'reports' && !s.done)}><span><b>{s.title}</b><small>{s.note}</small></span></button>
          </li>
        ))}
      </ol>
      {mod('materials') && <><h3 className="sub">Stock on site</h3><MaterialsTable materials={data.materials} usage={data.usage} /></>}
    </>
  );
}
