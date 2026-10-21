import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DRAWING_MAX_MB, DRAWING_TYPES, MODEL_MAX_MB, checkModelFile, friendlyError, stagesFor, workTypeOf } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { addStandardMilestones, createSite } from '../lib/db';
import { addDrawing, prepareDrawing, setOverviewDrawing } from '../lib/drawings';
import { uploadCover } from '../lib/cover';
import { uploadModel } from '../lib/model';
import { save, toast } from '../lib/save';
import SiteForm from '../components/SiteForm';
import ProgrammeImport from '../components/ProgrammeImport';
import { useTitle } from '../lib/hooks';

// A new project in three short steps: the basics (creates it), the programme, the files.
// Only the first is needed; the others can be skipped and done later from the project.
const STEPS = ['The basics', 'Programme', 'Files'];

export default function NewSite() {
  useTitle('New project');
  const { cid, can } = useAuth();
  const nav = useNavigate();
  const [site, setSite] = useState(null); // the created project: { id, ...details }
  const [step, setStep] = useState(0);

  async function create(data) {
    const { id, done } = createSite(cid, data);
    const res = await save(done, `Site ${data.name}`); // throws a friendly message on failure
    if (res.queued) {
      // Offline: the project syncs later; the programme and files need a connection
      toast(`${data.name} is saved on this device and will sync when you're back online. Add the programme and files from the project later.`, 'warn');
      return nav(`/sites/${id}`);
    }
    if (!can('sites.manage')) return nav(`/sites/${id}`);
    setSite({ id, ...data }); setStep(1);
  }

  return (
    <>
    <div className="dtop"><p className="crumb"><Link to="/">Dashboard</Link> / <Link to="/sites">Projects</Link> / New project</p></div>
    <section className="wrap narrow">
      <h1>New project</h1>
      <ol className="nsteps" aria-label="Steps">
        {STEPS.map((s, i) => <li key={s} className={i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}><b>{i < step ? '✓' : i + 1}</b>{s}</li>)}
      </ol>
      {step === 0 && <>
        <p className="muted lead">You can change these details later in the project's settings.</p>
        <SiteForm withBudget initial={{}} submitLabel={can('sites.manage') ? 'Create project and continue' : 'Create project'} busyLabel="Creating…" onSubmit={create} />
      </>}
      {step === 1 && site && <ProgrammeStep cid={cid} site={site} onNext={() => setStep(2)} />}
      {step === 2 && site && <FilesStep cid={cid} site={site} onDone={() => nav(`/sites/${site.id}`)} />}
    </section>
    </>
  );
}

function ProgrammeStep({ cid, site, onNext }) {
  const stages = stagesFor(workTypeOf(site.stage));
  const [how, setHow] = useState('upload'); // upload | standard
  const [busy, setBusy] = useState(false);
  async function useStandard() {
    setBusy(true);
    try { await save(addStandardMilestones(cid, site, stages), 'Milestones'); toast('Standard stages added. Adjust them on the Progress tab.'); onNext(); }
    catch (e) { toast(friendlyError(e), 'err'); } finally { setBusy(false); }
  }
  return (
    <div className="card form">
      <h2 className="m0">The programme</h2>
      <p className="muted">The project's stages and their dates. Progress is tracked against them.</p>
      <div className="howpick" role="group" aria-label="How to set up the stages">
        <button type="button" aria-pressed={how === 'upload'} onClick={() => setHow('upload')}><b>Upload my programme</b><span>From Excel, CSV or MS Project. Its tasks become the stages.</span></button>
        {stages.length > 0 && <button type="button" aria-pressed={how === 'standard'} onClick={() => setHow('standard')}><b>Use the standard stages</b><span>{stages.slice(0, 4).join(', ')}{stages.length > 4 ? '…' : ''}, spread over the planned dates.</span></button>}
      </div>
      {how === 'upload' ? <ProgrammeImport cid={cid} site={site} onDone={onNext} /> : (
        <div className="actions"><button type="button" className="btn gold" disabled={busy} onClick={useStandard}>{busy ? 'Adding…' : `Use these ${stages.length} stages`}</button></div>
      )}
      <div className="actions mt"><button type="button" className="btn ghost" onClick={onNext}>Skip for now</button></div>
    </div>
  );
}

function FilesStep({ cid, site, onDone }) {
  const { user, profile } = useAuth();
  const [cover, setCover] = useState(null);
  const [plan, setPlan] = useState(null);
  const [model, setModel] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  async function upload() {
    if (plan && plan.size > DRAWING_MAX_MB * 1024 * 1024) return setErr(`The site plan is over ${DRAWING_MAX_MB} MB. Export a smaller PDF or image.`);
    const modelCheck = model && checkModelFile(model.name, model.size);
    if (modelCheck && 'error' in modelCheck) return setErr(modelCheck.error);
    setErr('');
    // Each file on its own: one failing doesn't stop the others
    const warn = (what, e) => { console.error(`${what} upload failed`, e); toast(`The ${what} could not be uploaded: ${friendlyError(e)} Add it from the project.`, 'warn'); };
    if (cover) { setBusy('Uploading the project image…'); await uploadCover(cid, site.id, cover).catch((e) => warn('project image', e)); }
    if (plan) {
      setBusy('Uploading the site plan…');
      try {
        const prepared = await prepareDrawing(plan);
        const title = plan.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 120) || 'Site plan';
        const did = await addDrawing(cid, site.id, { title, sheet: '', discipline: 'site' }, plan, prepared, { uid: user.uid, name: profile.name });
        await setOverviewDrawing(cid, site.id, did);
      } catch (e) { warn('site plan', e); }
    }
    if (model) { setBusy('Uploading the 3D model…'); await uploadModel(cid, site.id, model, null, { uid: user.uid, name: profile.name }).catch((e) => warn('3D model', e)); }
    setBusy('');
    onDone();
  }

  const any = cover || plan || model;
  return (
    <div className="card form">
      <h2 className="m0">Files</h2>
      <p className="muted">All optional. You can add or change them later on the project.</p>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="field"><label htmlFor="ns-cover">Project image</label>
        <input id="ns-cover" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setCover(e.target.files?.[0] || null)} />
        <p className="hint">An architect's visualization (3D render) of the finished project, or a photo. It shows on the project's card.</p></div>
      <div className="field"><label htmlFor="ns-plan">Site plan or drawing</label>
        <input id="ns-plan" type="file" accept={DRAWING_TYPES.join(',')} onChange={(e) => setPlan(e.target.files?.[0] || null)} />
        <p className="hint">PDF (page 1 is shown), PNG or JPG, up to {DRAWING_MAX_MB} MB. It shows on the project overview, where you can mark areas and pin issues.</p></div>
      <div className="field"><label htmlFor="ns-model">3D model</label>
        <input id="ns-model" type="file" accept=".ifc,.glb,.gltf" onChange={(e) => setModel(e.target.files?.[0] || null)} />
        <p className="hint">The architect's 3D model, if you have one: IFC or GLB, up to {MODEL_MAX_MB} MB. From Revit or SketchUp, ask the architect for an IFC or GLB export.</p></div>
      {busy && <p className="muted small" role="status">{busy}</p>}
      <div className="actions">
        <button type="button" className="btn gold" disabled={!!busy || !any} onClick={upload}>Upload and finish</button>
        <button type="button" className="btn ghost" disabled={!!busy} onClick={onDone}>{any ? 'Skip the files' : 'Finish'}</button>
      </div>
    </div>
  );
}
