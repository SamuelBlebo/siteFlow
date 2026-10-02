import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { createSite } from '../lib/db';
import { save, toast } from '../lib/save';
import SiteForm from '../components/SiteForm';
import { useTitle } from '../lib/hooks';

export default function NewSite() {
  useTitle('Add a site');
  const { cid } = useAuth();
  const nav = useNavigate();

  async function create(data) {
    const { id, done } = createSite(cid, data);
    const res = await save(done, `Site ${data.name}`); // throws a friendly message on failure
    if (res.queued) toast(`${data.name} is saved on this device and will sync when you're back online.`, 'warn');
    nav(`/sites/${id}?tab=team`);
  }

  return (
    <section className="wrap narrow">
      <h1>Add a site</h1>
      <p className="muted lead">One site per project. You can change these details later in the site's settings.</p>
      <SiteForm withBudget initial={{}} submitLabel="Create site" busyLabel="Creating…" onSubmit={create} />
    </section>
  );
}
