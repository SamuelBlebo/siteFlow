import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DRAWING_MAX_MB, DRAWING_TYPES, MODEL_MAX_MB, checkModelFile, friendlyError } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { createSite } from '../lib/db';
import { addDrawing, prepareDrawing, setOverviewDrawing } from '../lib/drawings';
import { uploadCover } from '../lib/cover';
import { uploadModel } from '../lib/model';
import { save, toast } from '../lib/save';
import SiteForm from '../components/SiteForm';
import { useTitle } from '../lib/hooks';

export default function NewSite() {
  useTitle('Add a site');
  const { cid, user, profile, can } = useAuth();
  const nav = useNavigate();
  const [plan, setPlan] = useState(null);
  const [cover, setCover] = useState(null);
  const [model, setModel] = useState(null);

  async function create(data) {
    if (plan && plan.size > DRAWING_MAX_MB * 1024 * 1024) throw new Error(`The site plan is over ${DRAWING_MAX_MB} MB. Export a smaller PDF or image.`);
    const modelCheck = model && checkModelFile(model.name, model.size);
    if (modelCheck && 'error' in modelCheck) throw new Error(modelCheck.error);
    const { id, done } = createSite(cid, data);
    const res = await save(done, `Site ${data.name}`); // throws a friendly message on failure
    if (res.queued) toast(`${data.name} is saved on this device and will sync when you're back online.`, 'warn');
    // The project image (visualization or photo); a failure doesn't stop the project being created
    if (cover && !res.queued) {
      await uploadCover(cid, id, cover).catch((e) => toast(`The project was created, but the image could not be uploaded: ${friendlyError(e)} Add it in the project's settings.`, 'warn'));
    }
    // The architect's 3D model; a failure doesn't stop the project being created
    if (model && !res.queued) {
      await uploadModel(cid, id, model, null, { uid: user.uid, name: profile.name }).catch((e) => {
        console.error('Model upload failed', e);
        toast(`The project was created, but the 3D model could not be uploaded: ${friendlyError(e)} Upload it from the project overview.`, 'warn');
      });
    }
    // The site plan or drawing becomes the project's overview drawing
    if (plan && !res.queued) {
      try {
        const prepared = await prepareDrawing(plan);
        const title = plan.name.replace(/.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 120) || 'Site plan';
        const did = await addDrawing(cid, id, { title, sheet: '', discipline: 'site' }, plan, prepared, { uid: user.uid, name: profile.name });
        await setOverviewDrawing(cid, id, did);
      } catch (e) {
        console.error('Site plan upload failed', e);
        toast(`The project was created, but the site plan could not be uploaded: ${friendlyError(e)} Upload it from the project overview.`, 'warn');
        return nav(`/sites/${id}`);
      }
      return nav(`/sites/${id}`);
    }
    nav(model ? `/sites/${id}` : `/sites/${id}?tab=team`);
  }

  const planField = can('sites.manage') && (<>
    <div className="field"><label htmlFor="ns-cover">Project image (optional)</label>
      <input id="ns-cover" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setCover(e.target.files?.[0] || null)} />
      <p className="hint">An architect's visualization (3D render) of the finished project, or a photo. It shows on the project's card.</p></div>
    <div className="field"><label htmlFor="ns-plan">Site plan or drawing (optional)</label>
      <input id="ns-plan" type="file" accept={DRAWING_TYPES.join(',')} onChange={(e) => setPlan(e.target.files?.[0] || null)} />
      <p className="hint">PDF (page 1 is shown), PNG or JPG, up to {DRAWING_MAX_MB} MB. It shows on the project overview, where you can mark areas and pin issues. You can add more sheets later.</p></div>
    <div className="field"><label htmlFor="ns-model">3D model (optional)</label>
      <input id="ns-model" type="file" accept=".ifc,.glb,.gltf" onChange={(e) => setModel(e.target.files?.[0] || null)} />
      <p className="hint">The architect's 3D model, if you have one: IFC or GLB, up to {MODEL_MAX_MB} MB. Everyone on the project can turn it around on the overview. From Revit or SketchUp, ask the architect for an IFC or GLB export.</p></div>
  </>);

  return (
    <>
    <div className="dtop"><p className="crumb"><Link to="/">Dashboard</Link> / <Link to="/sites">Projects</Link> / New project</p></div>
    <section className="wrap narrow">
      <h1>New project</h1>
      <p className="muted lead">You can change these details later in the project's settings.</p>
      <SiteForm withBudget initial={{}} submitLabel={plan || model ? 'Create project and upload files' : 'Create project'} busyLabel="Creating…" onSubmit={create} extra={planField} />
    </section>
    </>
  );
}
