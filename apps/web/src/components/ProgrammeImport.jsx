import { useState } from 'react';
import { friendlyError, parseCsv, prettyDate, programmeFromProjectXml, programmeFromRows } from '@siteflow/shared';
import { addProgrammeMilestones } from '../lib/db';
import { save, toast } from '../lib/save';

// Upload the contractor's programme (Excel, CSV or MS Project XML): its tasks become the project's
// stages with their dates, after a look at what was read. Used on a new project and on Progress.

async function readProgramme(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xml')) return programmeFromProjectXml(await file.text());
  if (name.endsWith('.csv')) return programmeFromRows(parseCsv(await file.text()));
  if (name.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser'); // loaded only when a sheet is chosen
    return programmeFromRows(await readSheet(file));
  }
  if (name.endsWith('.mpp')) return { stages: [], error: 'SiteFlow can’t open .mpp files. In MS Project use File, Save As, and choose XML (or Excel).' };
  if (name.endsWith('.xls')) return { stages: [], error: 'Save the sheet as .xlsx (Excel Workbook) or CSV, then choose it again.' };
  return { stages: [], error: 'Choose an Excel (.xlsx), CSV or MS Project XML file.' };
}

const when = (s) => (s.plannedStart || s.plannedEnd ? `${s.plannedStart ? prettyDate(s.plannedStart) : '…'} – ${s.plannedEnd ? prettyDate(s.plannedEnd) : '…'}` : 'No dates');

export default function ProgrammeImport({ cid, site, onDone }) {
  const [programme, setProgramme] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr(''); setProgramme(null); setBusy(true);
    try {
      const p = await readProgramme(file);
      if (p.error) setErr(p.error); else setProgramme(p);
    } catch (e2) {
      console.error('Programme could not be read', e2);
      setErr('Could not read this file. Check it opens in Excel or MS Project, then try again.');
    } finally { setBusy(false); }
  }

  async function use() {
    setBusy(true);
    try {
      await save(addProgrammeMilestones(cid, site, programme), 'The programme');
      toast(`${programme.stages.length} stage${programme.stages.length === 1 ? '' : 's'} added from your programme.`);
      onDone?.(true);
    } catch (e2) { setErr(friendlyError(e2)); } finally { setBusy(false); }
  }

  return (
    <div className="prog-import">
      {err && <p className="err" role="alert">{err}</p>}
      {!programme ? (
        <div className="field">
          <label htmlFor="pi-file">Programme file</label>
          <input id="pi-file" type="file" accept=".xlsx,.csv,.xml,.mpp,.xls" onChange={pick} disabled={busy} />
          <p className="hint">Excel (.xlsx) or CSV with columns such as Task, Start and Finish, or an MS Project file saved as XML. {busy ? 'Reading…' : ''}</p>
        </div>
      ) : (
        <>
          <p><b>{programme.stages.length} stage{programme.stages.length === 1 ? '' : 's'} found</b>{programme.start && programme.end ? `, ${prettyDate(programme.start)} to ${prettyDate(programme.end)}` : ''}.</p>
          {programme.note && <p className="notice">{programme.note}</p>}
          <ol className="prog-list">
            {programme.stages.map((s, i) => <li key={i}><span>{s.name}</span><span className="muted small">{when(s)}</span></li>)}
          </ol>
          <div className="actions">
            <button type="button" className="btn gold" disabled={busy} onClick={use}>{busy ? 'Saving…' : `Use these ${programme.stages.length} stages`}</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setProgramme(null)}>Choose another file</button>
          </div>
        </>
      )}
    </div>
  );
}
