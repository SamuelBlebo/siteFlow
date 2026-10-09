import { useAuth } from '../auth/AuthProvider';
import { useDoc, useTitle } from '../lib/hooks';
import { companyDoc } from '../lib/db';
import PageHead from '../components/PageHead';
import { NotificationLog, NotificationSettings } from '../components/Notifications';
import { ErrorState, Loading } from '../components/States';

// Owner: which reminders and alerts go out, by WhatsApp and email, and what was sent
export default function Reminders() {
  useTitle('Reminders');
  const { cid } = useAuth();
  const { data: company, loading, error } = useDoc(() => cid && companyDoc(cid), [cid]);
  if (loading) return <Loading what="reminders" />;
  if (error || !company) return <section className="wrap"><ErrorState error={error} what="your reminder settings" /></section>;
  return (
    <>
      <PageHead title="Reminders and alerts" sub="Choose how each alert is sent. People receive them even if they never open the app." />
      <div className="dpage">
        <NotificationSettings cid={cid} company={company} />
        <h2 className="sec">Messages sent</h2>
        <NotificationLog cid={cid} />
      </div>
    </>
  );
}
