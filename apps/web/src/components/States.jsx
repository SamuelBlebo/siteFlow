import { errorCode, friendlyError } from '@siteflow/shared';

// Consistent loading, empty and error states for every screen

export const Loading = ({ what = '' }) => <p className="pad muted" role="status">Loading{what ? ` ${what}` : ''}…</p>;

export function Empty({ title, children }) {
  return (
    <div className="empty">
      {title && <p><b>{title}</b></p>}
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorState({ error, what = 'this', onRetry }) {
  const denied = errorCode(error) === 'permission-denied';
  return (
    <div className="err" role="alert">
      <p><b>{denied ? `You don't have access to ${what}.` : `Could not load ${what}.`}</b></p>
      <p>{denied ? 'Ask your manager if you think you should.' : friendlyError(error)}</p>
      {onRetry && !denied && <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={onRetry}>Try again</button>}
    </div>
  );
}
