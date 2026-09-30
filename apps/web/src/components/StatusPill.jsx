import { SITE_STATUS_LABELS } from '@siteflow/shared';

export default function StatusPill({ status }) {
  const kind = status === 'active' ? 'ok' : status === 'on_hold' ? 'warn' : 'bad';
  return <span className={`pill ${kind}`}>{SITE_STATUS_LABELS[status] || status}</span>;
}
