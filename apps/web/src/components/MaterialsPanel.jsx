import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useQuery } from '../lib/hooks';
import { materialLogsQuery } from '../lib/db';
import {
  MATERIAL_LOG_LABELS, averageDailyUse, cedi, dateRange, materialLogCsv, materialTotals, prettyDate, todayKey,
} from '@siteflow/shared';
import MaterialsTable from './MaterialsTable';
import MaterialLogForm from './MaterialLogForm';
import MaterialSetup from './MaterialSetup';
import { Empty, ErrorState, Loading } from './States';

const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return todayKey(d); };
const RATE_DAYS = 14;
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

// Stock, recording, history and set-up for one site's materials
export default function MaterialsPanel({ cid, site, data, canWork }) {
  const { can } = useAuth();
  const [view, setView] = useState('stock');
  // The last two weeks of entries give each material's average daily use
  const { data: recent } = useQuery(() => cid && materialLogsQuery(cid, site.id, { from: ago(RATE_DAYS - 1) }), [cid, site.id]);
  const rates = useMemo(() => {
    const days = dateRange(ago(RATE_DAYS - 1), todayKey());
    return Object.fromEntries(data.materials.map((m) => [m.id, averageDailyUse(recent, m.id, days)]));
  }, [recent, data.materials]);
  const views = [['stock', 'Stock'], ...(canWork ? [['record', 'Record']] : []), ['history', 'History'], ...(can('sites.manage') ? [['setup', 'Set up']] : [])];

  return (
    <>
      <div className="seg" role="group" aria-label="Materials">
        {views.map(([k, l]) => <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>)}
      </div>
      {view === 'stock' && (
        <>
          <MaterialsTable materials={data.materials} usage={data.usage} rates={rates} />
          <p className="hint">Average a day is from the last {RATE_DAYS} days of recorded use. Days left assumes the same rate.</p>
        </>
      )}
      {view === 'record' && canWork && <MaterialLogForm cid={cid} sid={site.id} materials={data.materials} />}
      {view === 'history' && <MaterialHistory cid={cid} site={site} materials={data.allMaterials} />}
      {view === 'setup' && can('sites.manage') && <MaterialSetup cid={cid} sid={site.id} materials={data.allMaterials} canCount={canWork} />}
    </>
  );
}

function MaterialHistory({ cid, site, materials }) {
  const { can } = useAuth();
  const money = can('finance.view');
  const [days, setDays] = useState('30');
  const [materialId, setMaterialId] = useState('');
  const [type, setType] = useState('');
  const from = days === 'all' ? '' : ago(Number(days) - 1);
  const { data: logs, loading, error } = useQuery(() => cid && materialLogsQuery(cid, site.id, { from, materialId }, 500), [cid, site.id, from, materialId]);
  const shown = type ? logs.filter((l) => l.type === type) : logs;
  const totals = materialTotals(logs);

  return (
    <>
      <div className="filters">
        <div className="field"><label htmlFor="mh-p">Period</label>
          <select id="mh-p" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 3 months</option><option value="all">All time</option>
          </select></div>
        <div className="field"><label htmlFor="mh-m">Material</label>
          <select id="mh-m" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
            <option value="">All materials</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.name}{m.active === false ? ' (archived)' : ''}</option>)}
          </select></div>
        <div className="field"><label htmlFor="mh-t">Entries</label>
          <select id="mh-t" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All</option>{Object.entries(MATERIAL_LOG_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></div>
      </div>
      {loading ? <Loading what="material history" /> : error ? <ErrorState error={error} what="material history" /> : !logs.length ? (
        <Empty title="No entries in this period." />
      ) : (
        <>
          <h3 className="sub">Totals</h3>
          <div className="scroll"><table>
            <thead><tr><th>Material</th><th>Received</th><th>Used</th><th>Stock counts</th>{money && <th>Delivery cost</th>}</tr></thead>
            <tbody>{totals.map((t) => (
              <tr key={t.materialId}><td>{t.name}</td><td>{t.received} {t.unit}</td><td>{t.used} {t.unit}</td>
                <td>{t.adjusted ? `${t.adjusted > 0 ? '+' : ''}${t.adjusted} ${t.unit}` : '–'}</td>{money && <td>{cedi(t.cost)}</td>}</tr>
            ))}</tbody>
          </table></div>
          <div className="section-head">
            <h3 className="sub">Entries</h3>
            <button type="button" className="btn sm ghost" onClick={() => download(`materials-${site.name.replace(/[^\w]+/g, '-')}-${from || 'all'}.csv`, materialLogCsv(shown, money))}>Download (CSV)</button>
          </div>
          <div className="scroll"><table>
            <thead><tr><th>Date</th><th>Entry</th><th>Material</th><th>Quantity</th><th>Details</th><th>By</th>{money && <th>Cost</th>}</tr></thead>
            <tbody>{shown.map((l) => (
              <tr key={l.id}>
                <td>{prettyDate(l.date)}</td>
                <td><span className={`pill ${l.type === 'delivery' ? 'ok' : l.type === 'adjustment' ? 'warn' : ''}`}>{MATERIAL_LOG_LABELS[l.type]}</span></td>
                <td>{l.materialName}</td>
                <td className={l.type === 'usage' || l.qty < 0 ? 'neg' : ''}>{l.type === 'usage' ? '−' : l.qty > 0 ? '+' : '−'}{Math.abs(l.qty)} {l.unit}</td>
                <td className="small">{[l.supplier, l.ref && `Ref ${l.ref}`, l.note].filter(Boolean).join(' · ') || '–'}</td>
                <td className="small">{l.createdByName || '–'}</td>
                {money && <td>{l.cost ? cedi(l.cost) : '–'}</td>}
              </tr>
            ))}</tbody>
          </table></div>
          {logs.length >= 500 && <p className="hint">Showing the latest 500 entries. Choose a shorter period or one material to see the rest.</p>}
        </>
      )}
    </>
  );
}
