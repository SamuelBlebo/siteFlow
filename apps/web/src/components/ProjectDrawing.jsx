import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  DISCIPLINES, DISCIPLINE_LABELS, DRAWING_MAX_MB, ISSUE_PRIORITY_LABELS, ZONE_LABELS, drawingInput, friendlyError, newZoneId,
  overviewDrawing, pinAt, todayKey, validate, zoneInput, zoneRect, zoneState, zoneSummary,
} from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { useQuery } from '../lib/hooks';
import { milestonesQuery, siteIssuesQuery } from '../lib/db';
import { addDrawing, deleteDrawing, drawingsQuery, prepareDrawing, renameDrawing, saveZones, setOverviewDrawing } from '../lib/drawings';
import { save, toast } from '../lib/save';
import IssueForm from './IssueForm';

// The project drawing on the overview: the architect's sheet, with areas coloured by the progress of
// the programme stage they are linked to, and open issues pinned where they are.
// Owners, admins and project managers upload sheets and mark areas; the site team pins issues.

const ZOOMS = [1, 1.5, 2, 3, 4];
const STATES = ['done', 'progress', 'behind', 'todo', 'none'];
const pct = (n) => `${(n * 100).toFixed(3)}%`;
const sheetName = (d) => [d.sheet, d.title].filter(Boolean).join(' · ');

export default function ProjectDrawing({ cid, site }) {
  const { can } = useAuth();
  const manage = can('sites.manage');
  const work = can('site.work') && site.status !== 'closed';
  const [params, setParams] = useSearchParams();
  const { data: drawings, loading, error } = useQuery(() => cid && drawingsQuery(cid, site.id), [cid, site.id]);
  const [adding, setAdding] = useState(false);
  const current = drawings.find((d) => d.id === params.get('sheet')) ?? overviewDrawing(drawings, site.overviewDrawingId);
  const pick = (id) => { const p = new URLSearchParams(params); p.set('sheet', id); p.delete('pin'); setParams(p, { replace: true }); };

  return (
    <section className="panel dwg mb" aria-labelledby="dwg-h">
      <div className="panel-h">
        <div>
          <h2 id="dwg-h">Project drawing</h2>
          <p>{current ? sheetName(current) : 'The architect’s drawing, with progress by area and issues pinned where they are.'}</p>
        </div>
        {manage && !adding && <button type="button" className={`btn sm ${drawings.length ? 'ghost' : 'gold'}`} onClick={() => setAdding(true)}>Upload drawing</button>}
      </div>
      {adding && <DrawingUpload cid={cid} site={site} first={!drawings.length} onDone={(id) => { setAdding(false); if (id) pick(id); }} />}
      {error ? <p className="notice warn">Could not load the drawings. {friendlyError(error)}</p>
        : loading ? <p className="muted small">Loading drawings…</p>
          : !current ? (!adding && (
            <div className="dwg-empty">
              <p><b>No drawing yet.</b> {manage
                ? 'Upload the floor plan or site plan (PDF or image). Then mark areas on it and link them to programme stages, so everyone sees what is done at a glance.'
                : 'When a manager uploads the project drawing, it shows here with progress by area.'}</p>
            </div>
          )) : <Board key={current.id} cid={cid} site={site} drawing={current} drawings={drawings} manage={manage} work={work} onPick={pick} focusPin={params.get('pin')} />}
    </section>
  );
}

function Board({ cid, site, drawing, drawings, manage, work, onPick, focusPin }) {
  const { data: milestones } = useQuery(() => cid && milestonesQuery(cid, site.id), [cid, site.id]);
  const { data: issues } = useQuery(() => cid && siteIssuesQuery(cid, site.id, 200), [cid, site.id]);
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState('view'); // view | areas | pin
  const [selected, setSelected] = useState(null); // zone id
  const [draft, setDraft] = useState(null); // { start, end } while dragging, then { rect } waiting for a name
  const [pin, setPin] = useState(null);
  const [editing, setEditing] = useState(false);
  const sheet = useRef(null);
  const today = todayKey();
  const zones = drawing.zones || [];
  const pins = issues.filter((i) => i.pin?.drawingId === drawing.id && (i.status === 'open' || i.status === 'in_progress'));
  const summary = zoneSummary(zones, milestones, today);
  const chosen = zones.find((z) => z.id === selected);

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') { setMode('view'); setDraft(null); setPin(null); setSelected(null); } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  // An issue opened from "Show on drawing": zoom in on its pin
  useEffect(() => {
    const p = pins.find((i) => i.id === focusPin);
    if (!p || !sheet.current) return;
    setZoom(2);
    requestAnimationFrame(() => {
      const box = sheet.current?.parentElement;
      if (!box) return;
      box.scrollTo({ left: p.pin.x * box.scrollWidth - box.clientWidth / 2, top: p.pin.y * box.scrollHeight - box.clientHeight / 2, behavior: 'smooth' });
    });
  }, [focusPin, pins.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const at = (e) => {
    const r = sheet.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const onDown = (e) => {
    if (mode !== 'areas' || e.button > 0 || e.target.closest('.zone, .pin')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    setSelected(null);
    setDraft({ start: p, end: p });
  };
  const onMove = (e) => { if (draft?.start) setDraft({ ...draft, end: at(e) }); };
  const onUp = () => {
    if (!draft?.start) return;
    const rect = zoneRect(draft.start, draft.end);
    setDraft(rect ? { rect } : null);
  };
  const onClick = (e) => {
    if (mode !== 'pin' || e.target.closest('.pin')) return;
    setPin(pinAt(drawing.id, at(e)));
  };
  const box = (r) => ({ left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) });
  const live = draft?.start ? zoneRect(draft.start, draft.end) : draft?.rect;

  async function writeZones(next, label) {
    try { await save(saveZones(cid, site.id, drawing.id, next), label); return true; } catch (e) { toast(friendlyError(e), 'err'); return false; }
  }
  const switchMode = (m) => { setMode(mode === m ? 'view' : m); setDraft(null); setPin(null); setSelected(null); };

  return (
    <>
      <div className="dwg-tools">
        {drawings.length > 1 && (
          <label className="dwg-sheetpick"><span className="visually-hidden">Sheet</span>
            <select value={drawing.id} onChange={(e) => onPick(e.target.value)}>
              {drawings.map((d) => <option key={d.id} value={d.id}>{sheetName(d)}{d.id === site.overviewDrawingId ? ' (overview)' : ''}</option>)}
            </select>
          </label>
        )}
        <div className="seg zoom" role="group" aria-label="Zoom">
          <button type="button" onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])} disabled={zoom === ZOOMS[0]} aria-label="Zoom out">−</button>
          <span aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])} disabled={zoom === ZOOMS[ZOOMS.length - 1]} aria-label="Zoom in">+</button>
        </div>
        <span className="grow" />
        {manage && <button type="button" className={`btn sm ${mode === 'areas' ? 'gold' : 'ghost'}`} aria-pressed={mode === 'areas'} onClick={() => switchMode('areas')}>{mode === 'areas' ? 'Done marking' : 'Mark areas'}</button>}
        {work && <button type="button" className={`btn sm ${mode === 'pin' ? 'gold' : 'ghost'}`} aria-pressed={mode === 'pin'} onClick={() => switchMode('pin')}>{mode === 'pin' ? 'Cancel pin' : 'Pin an issue'}</button>}
        <a className="btn sm ghost" href={drawing.file} target="_blank" rel="noreferrer">Open original</a>
      </div>
      {mode !== 'view' && (
        <p className="notice dwg-hint" role="status">{mode === 'areas'
          ? 'Drag a box over a part of the drawing (a room, a floor, a block) to mark an area. Click an area to rename it, link it to a stage or delete it.'
          : 'Click where the problem is on the drawing.'}</p>
      )}

      <div className="dwg-scroll">
        <div ref={sheet} className={`dwg-sheet mode-${mode}`} style={{ width: `${zoom * 100}%`, aspectRatio: `${drawing.width} / ${drawing.height}` }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onClick={onClick}>
          <img src={drawing.image} alt={`Drawing: ${sheetName(drawing)}`} draggable={false} />
          {zones.map((z) => {
            const st = zoneState(z, milestones, today);
            return (
              <button key={z.id} type="button" className={`zone ${st.state} ${z.id === selected ? 'sel' : ''}`} style={box(z)}
                title={`${z.name}: ${st.state === 'none' ? ZONE_LABELS.none : `${st.stage}, ${st.pct}% (${ZONE_LABELS[st.state].toLowerCase()})`}`}
                onClick={(e) => { if (mode === 'pin') return; e.stopPropagation(); setSelected(z.id === selected ? null : z.id); setDraft(null); }}>
                <span className="zlabel">{z.name}{st.pct != null ? ` ${st.pct}%` : ''}</span>
              </button>
            );
          })}
          {live && <div className="zone draft" style={box(live)} />}
          {pins.map((i, n) => (
            <Link key={i.id} className={`pin ${i.priority} ${i.id === focusPin ? 'focus' : ''}`} style={{ left: pct(i.pin.x), top: pct(i.pin.y) }}
              to={`/issues/${site.id}/${i.id}`} title={`${i.title} (${ISSUE_PRIORITY_LABELS[i.priority]})`} onClick={(e) => e.stopPropagation()}>
              <span>{n + 1}</span>
            </Link>
          ))}
          {pin && <span className="pin new" style={{ left: pct(pin.x), top: pct(pin.y) }} aria-hidden="true"><span>+</span></span>}
        </div>
      </div>

      <ul className="dwg-legend" aria-label="Key">
        {STATES.filter((s) => s !== 'none' || summary.none).map((s) => (
          <li key={s}><i className={`sw ${s}`} aria-hidden="true" />{ZONE_LABELS[s]}{zones.length ? <b>{summary[s]}</b> : null}</li>
        ))}
        <li><i className="sw pinned" aria-hidden="true" />Open issues <b>{pins.length}</b></li>
      </ul>
      {!zones.length && manage && mode === 'view' && (
        <p className="hint">No areas marked yet. Choose <b>Mark areas</b> and drag over each part of the building, then link it to a stage from the programme.</p>
      )}

      {draft?.rect && (
        <ZoneForm milestones={milestones} title="New area" onCancel={() => setDraft(null)}
          onSave={async (v) => { if (await writeZones([...zones, { id: newZoneId(), ...draft.rect, ...v }], 'Area')) { setDraft(null); toast(`${v.name} marked.`); } }} />
      )}
      {chosen && !draft && (mode === 'areas' && manage ? (
        <ZoneForm milestones={milestones} title={`Area: ${chosen.name}`} zone={chosen} onCancel={() => setSelected(null)}
          onSave={async (v) => { if (await writeZones(zones.map((z) => (z.id === chosen.id ? { ...z, ...v } : z)), 'Area')) setSelected(null); }}
          onDelete={async () => { if (await writeZones(zones.filter((z) => z.id !== chosen.id), 'Area')) { setSelected(null); toast(`${chosen.name} removed.`); } }} />
      ) : <ZoneInfo zone={chosen} milestones={milestones} today={today} site={site} onClose={() => setSelected(null)} />)}
      {pin && (
        <div className="card mt dwg-issue">
          <h3>Report an issue here</h3>
          <IssueForm cid={cid} sites={[site]} pin={pin} location={zones.find((z) => pin.x >= z.x && pin.x <= z.x + z.w && pin.y >= z.y && pin.y <= z.y + z.h)?.name || ''}
            onDone={() => { setPin(null); setMode('view'); toast('Issue reported and pinned on the drawing.'); }} />
          <button type="button" className="btn ghost sm mt-sm" onClick={() => setPin(null)}>Cancel</button>
        </div>
      )}

      {manage && mode === 'view' && (
        <div className="dwg-sheetops">
          {drawing.id !== site.overviewDrawingId && (
            <button type="button" className="btn sm ghost" onClick={() => save(setOverviewDrawing(cid, site.id, drawing.id), 'Overview drawing').then(() => toast('This drawing now shows first on the project.')).catch((e) => toast(friendlyError(e), 'err'))}>Show this drawing first</button>
          )}
          <button type="button" className="btn sm ghost" onClick={() => setEditing(!editing)}>Edit details</button>
          <button type="button" className="btn sm ghost danger" onClick={async () => {
            if (!window.confirm(`Delete ${sheetName(drawing)}? Its marked areas go too. Issues stay, without their pin.`)) return;
            try {
              await deleteDrawing(cid, site.id, drawing.id);
              if (site.overviewDrawingId === drawing.id) await setOverviewDrawing(cid, site.id, null);
              onPick(drawings.find((d) => d.id !== drawing.id)?.id || '');
              toast('Drawing deleted.');
            } catch (e) { toast(friendlyError(e), 'err'); }
          }}>Delete</button>
        </div>
      )}
      {editing && <DetailsForm initial={drawing} onCancel={() => setEditing(false)}
        onSave={async (v) => { try { await save(renameDrawing(cid, site.id, drawing.id, v), 'Drawing'); setEditing(false); } catch (e) { toast(friendlyError(e), 'err'); } }} />}
    </>
  );
}

function ZoneInfo({ zone, milestones, today, site, onClose }) {
  const st = zoneState(zone, milestones, today);
  return (
    <div className="card mt dwg-info" role="status">
      <h3>{zone.name}</h3>
      <p className="small">{st.state === 'none'
        ? 'Not linked to a programme stage yet.'
        : <>Stage <b>{st.stage}</b>: {st.pct}% done. <span className={`pill ${st.state === 'done' ? 'ok' : st.state === 'behind' ? 'bad' : st.state === 'progress' ? 'warn' : ''}`}>{ZONE_LABELS[st.state]}</span></>}</p>
      <div className="actions mt-sm">
        <Link className="btn sm ghost" to={`/sites/${site.id}?tab=progress`}>Programme</Link>
        <button type="button" className="btn sm ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function ZoneForm({ milestones, title, zone, onSave, onCancel, onDelete }) {
  const [f, setF] = useState({ name: zone?.name || '', milestoneId: zone?.milestoneId || '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const v = validate(zoneInput, { name: f.name, milestoneId: f.milestoneId || null });
    if (!v.ok) return setErr(v.error);
    setBusy(true);
    await onSave(v.data);
    setBusy(false);
  }
  return (
    <form className="form inline mt" onSubmit={submit}>
      <h3>{title}</h3>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="grid2">
        <div className="field"><label htmlFor="z-n">Area name</label>
          <input id="z-n" autoFocus maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Ground floor, Kitchen, Block B" /></div>
        <div className="field"><label htmlFor="z-m">Programme stage</label>
          <select id="z-m" value={f.milestoneId} onChange={(e) => setF({ ...f, milestoneId: e.target.value })}>
            <option value="">Not linked</option>
            {milestones.map((m) => <option key={m.id} value={m.id}>{m.name} ({Math.round(m.percentDone || 0)}%)</option>)}
          </select>
          <p className="hint">{milestones.length ? 'The area takes this stage’s progress and colour.' : 'Add stages on the Progress tab to colour areas by progress.'}</p></div>
      </div>
      <div className="actions">
        <button type="submit" className="btn gold" disabled={busy}>{busy ? 'Saving…' : 'Save area'}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        {onDelete && <button type="button" className="btn ghost danger" onClick={onDelete}>Delete area</button>}
      </div>
    </form>
  );
}

function DetailsFields({ f, setF, idp }) {
  return (
    <div className="grid3">
      <div className="field"><label htmlFor={`${idp}-t`}>Title</label><input id={`${idp}-t`} maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Ground floor plan" /></div>
      <div className="field"><label htmlFor={`${idp}-s`}>Sheet number (optional)</label><input id={`${idp}-s`} maxLength={30} value={f.sheet} onChange={(e) => setF({ ...f, sheet: e.target.value })} placeholder="e.g. A-101" /></div>
      <div className="field"><label htmlFor={`${idp}-d`}>Type</label>
        <select id={`${idp}-d`} value={f.discipline} onChange={(e) => setF({ ...f, discipline: e.target.value })}>
          {DISCIPLINES.map((d) => <option key={d} value={d}>{DISCIPLINE_LABELS[d]}</option>)}
        </select></div>
    </div>
  );
}

function DetailsForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({ title: initial.title, sheet: initial.sheet || '', discipline: initial.discipline });
  const [err, setErr] = useState('');
  return (
    <form className="form inline mt" onSubmit={(e) => { e.preventDefault(); const v = validate(drawingInput, f); if (!v.ok) return setErr(v.error); onSave(v.data); }}>
      <h3>Drawing details</h3>
      {err && <p className="err" role="alert">{err}</p>}
      <DetailsFields f={f} setF={setF} idp="dd" />
      <div className="actions"><button type="submit" className="btn gold">Save</button><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function DrawingUpload({ cid, site, first, onDone }) {
  const { user, profile } = useAuth();
  const [f, setF] = useState({ title: '', sheet: '', discipline: 'architectural' });
  const [file, setFile] = useState(null);
  const [overview, setOverview] = useState(first);
  const [step, setStep] = useState('');
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    const v = validate(drawingInput, f);
    if (!v.ok) return setErr(v.error);
    if (!file) return setErr('Choose the drawing file (PDF, PNG or JPG).');
    if (file.size > DRAWING_MAX_MB * 1024 * 1024) return setErr(`That file is over ${DRAWING_MAX_MB} MB. Export a smaller PDF or image.`);
    if (!navigator.onLine) return setErr('Uploading a drawing needs an internet connection.');
    setErr('');
    try {
      setStep(file.type === 'application/pdf' ? 'Reading the PDF…' : 'Preparing the image…');
      const prepared = await prepareDrawing(file);
      setStep('Uploading…');
      const id = await addDrawing(cid, site.id, v.data, file, prepared, { uid: user.uid, name: profile.name });
      if (overview) await setOverviewDrawing(cid, site.id, id);
      toast(prepared.pages > 1 ? `Drawing added. The PDF has ${prepared.pages} pages; page 1 is shown. Upload other sheets separately.` : 'Drawing added.');
      onDone(id);
    } catch (e2) {
      console.error('Drawing upload failed', e2);
      setErr(friendlyError(e2, 'Could not upload the drawing. Try again.'));
    } finally { setStep(''); }
  }
  return (
    <form className="form inline" onSubmit={submit}>
      <h3>Upload a drawing</h3>
      {err && <p className="err" role="alert">{err}</p>}
      <DetailsFields f={f} setF={setF} idp="du" />
      <div className="field"><label htmlFor="du-f">File</label>
        <input id="du-f" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => {
          const x = e.target.files?.[0] || null;
          setFile(x);
          if (x && !f.title) setF({ ...f, title: x.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 120) });
        }} />
        <p className="hint">PDF (page 1 is shown), PNG or JPG, up to {DRAWING_MAX_MB} MB. One sheet per upload.</p></div>
      <label className="dwg-check"><input type="checkbox" checked={overview} onChange={(e) => setOverview(e.target.checked)} /> Show this drawing first on the project</label>
      <div className="actions">
        <button type="submit" className="btn gold" disabled={!!step}>{step || 'Upload drawing'}</button>
        <button type="button" className="btn ghost" onClick={() => onDone(null)} disabled={!!step}>Cancel</button>
      </div>
    </form>
  );
}
