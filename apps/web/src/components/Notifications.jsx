import { useState } from 'react';
import { NOTIFICATIONS, NOTIFICATION_KINDS, notificationRule } from '@siteflow/shared';
import { useQuery } from '../lib/hooks';
import { notificationsQuery, updateNotifications } from '../lib/db';
import { save, toast } from '../lib/save';
import { Empty, ErrorState, Loading } from './States';

// Owner: which notifications go out and how
export function NotificationSettings({ cid, company }) {
  const [rules, setRules] = useState(() => Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, notificationRule(company, k)])));
  const [busy, setBusy] = useState(false);
  const toggle = (k, ch) => setRules({ ...rules, [k]: { ...rules[k], [ch]: !rules[k][ch] } });
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try { await save(updateNotifications(cid, rules), 'Notification settings'); toast('Notification settings saved.'); }
    catch (e2) { toast(e2.message, 'err'); }
    finally { setBusy(false); }
  }
  return (
    <form className="form card" onSubmit={submit}>
      <p className="muted">Messages go to each person's WhatsApp number and email on their account. People without a number get email only.</p>
      <div className="scroll"><table>
        <thead><tr><th>Notification</th><th>Who gets it</th><th>WhatsApp</th><th>Email</th></tr></thead>
        <tbody>
          {NOTIFICATION_KINDS.map((k) => (
            <tr key={k}>
              <td><b>{NOTIFICATIONS[k].label}</b><div className="muted small">{NOTIFICATIONS[k].description}</div></td>
              <td className="small">{NOTIFICATIONS[k].who}</td>
              <td><input type="checkbox" className="check" aria-label={`${NOTIFICATIONS[k].label} by WhatsApp`} checked={rules[k].whatsapp} onChange={() => toggle(k, 'whatsapp')} /></td>
              <td><input type="checkbox" className="check" aria-label={`${NOTIFICATIONS[k].label} by email`} checked={rules[k].email} onChange={() => toggle(k, 'email')} /></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save notification settings'}</button>
    </form>
  );
}

const STATUS = { sent: ['ok', 'Sent'], failed: ['bad', 'Failed'], skipped: ['warn', 'Not sent'], sending: ['', 'Sending'] };

// Owner and admins: the last messages SiteFlow sent and what happened to them
export function NotificationLog({ cid }) {
  const { data, loading, error } = useQuery(() => cid && notificationsQuery(cid), [cid]);
  if (loading) return <Loading what="messages" />;
  if (error) return <ErrorState error={error} what="messages" />;
  if (!data.length) return <Empty title="No messages yet.">Alerts sent by WhatsApp or email appear here.</Empty>;
  return (
    <div className="scroll"><table>
      <thead><tr><th>When</th><th>Message</th><th>To</th><th>By</th><th>Result</th></tr></thead>
      <tbody>
        {data.map((n) => {
          const [kind, label] = STATUS[n.status] || ['', n.status];
          return (
            <tr key={n.id}>
              <td className="small">{n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '–'}</td>
              <td><b>{NOTIFICATIONS[n.kind]?.label || n.kind}</b><div className="muted small">{(n.text || '').slice(0, 140)}</div></td>
              <td className="small">{n.toName}<div className="muted">{n.to}</div></td>
              <td className="small">{n.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}</td>
              <td><span className={`pill ${kind}`}>{label}</span>{n.error ? <div className="muted small">{n.error}</div> : null}{n.attempts > 1 ? <div className="muted small">{n.attempts} tries</div> : null}</td>
            </tr>
          );
        })}
      </tbody>
    </table></div>
  );
}
