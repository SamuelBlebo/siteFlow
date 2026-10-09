import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DRAWING_MAX_MB, DRAWING_TYPES, friendlyError } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { createSite } from '../lib/db';
import { addDrawing, prepareDrawing, setOverviewDrawing } from '../lib/drawings';
import { save, toast } from '../lib/save';
import SiteForm from '../components/SiteForm';
import { useTitle } from '../lib/hooks';

export default function NewSite() {
  useTitle('Add a site');
  const { cid, user, profile, can } = useAuth();
  const nav = useNavigate();
  const [plan, setPlan] = useState(null);

  async function create(data) {
    if (plan && plan.size > DRAWING_MAX_MB * 1024 * 1024) throw new Error(`The site plan is over ${DRAWING_MAX_MB} MB. Export a smaller PDF or image.`);
    const { id, done } = createSite(cid, data);
    const res = await save(done, `Site ${data.name}`); // throws a friendly message on failure
    if (res.queued) toast(`${data.name} is saved on this device and will sync when you're back online.`, 'warn');
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
    nav(`/sites/${id}?tab=team`);
  }

  const planField = can('sites.manage') && (
    <div className="field"><label htmlFor="ns-plan">Site plan or drawing (optional)</label>
      <input id="ns-plan" type="file" accept={DRAWING_TYPES.join(',')} onChange={(e) => setPlan(e.target.files?.[0] || null)} />
      <p className="hint">PDF (page 1 is shown), PNG or JPG, up to {DRAWING_MAX_MB} MB. It shows on the project overview, where you can mark areas and pin issues. You can add more sheets later.</p></div>
  );

  return (
    <>
    <div className="dtop"><p className="crumb"><Link to="/">Dashboard</Link> / <Link to="/sites">Projects</Link> / New project</p></div>
    <section className="wrap narrow">
      <h1>New project</h1>
      <p className="muted lead">You can change these details later in the project's settings.</p>
      <SiteForm withBudget initial={{}} submitLabel={plan ? 'Create project and upload plan' : 'Create project'} busyLabel="Creating…" onSubmit={create} extra={planField} />
    </section>
    </>
  );
}
