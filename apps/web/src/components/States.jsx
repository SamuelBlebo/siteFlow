import { errorCode, friendlyError } from '@siteflow/shared';

// Consistent loading, empty and error states for every screen

export const Loading = ({ what = '' }) => <p className="pad muted loading" role="status"><span className="spinner" aria-hidden="true" />Loading{what ? ` ${what}` : ''}…</p>;

// action: an optional next step (a button or link), e.g. "Add a site"
export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      {title && <p><b>{title}</b></p>}
      {children && <p>{children}</p>}
      {action && <div className="mt-sm">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, what = 'this', onRetry }) {
  const denied = errorCode(error) === 'permission-denied';
  return (
    <div className="err" role="alert">
      <p><b>{denied ? `You don't have access to ${what}.` : `Could not load ${what}.`}</b></p>
      <p>{denied ? 'Ask your manager if you think you should.' : friendlyError(error)}</p>
      {onRetry && !denied && <button type="button" className="btn sm ghost mt-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}
