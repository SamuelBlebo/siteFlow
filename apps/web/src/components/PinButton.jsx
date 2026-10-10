import { useAuth } from '../auth/AuthProvider';
import { togglePin } from '../lib/db';
import { toast } from '../lib/save';

// Personal pins: a person's pinned projects come first on Projects and in the sidebar.
// Stored on users/{uid}.pinned as "companyId/projectId" (one login can be in several companies).
export const pinKey = (cid, sid) => `${cid}/${sid}`;
export const usePins = () => {
  const { profile, cid } = useAuth();
  const set = new Set(profile?.pinned || []);
  return (sid) => set.has(pinKey(cid, sid));
};

export default function PinButton({ site, className = '' }) {
  const { user, profile, cid } = useAuth();
  const key = pinKey(cid, site.id);
  const on = (profile?.pinned || []).includes(key);
  const flip = (e) => {
    e.preventDefault(); e.stopPropagation(); // inside cards and clickable rows
    togglePin(user.uid, profile?.pinned || [], key, !on).catch(() => toast('Could not change the pin. Try again.', 'err'));
  };
  return (
    <button type="button" className={`pin-btn ${on ? 'on' : ''} ${className}`} onClick={flip} aria-pressed={on}
      aria-label={on ? `Unpin ${site.name}` : `Pin ${site.name}`} title={on ? 'Pinned: shown first. Click to unpin.' : 'Pin: show this project first'}>
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" d="M5.5 1.5h5l-.8 4.2 2.8 2.6v1.2H8.6V15L8 15.6 7.4 15V9.5H3.5V8.3l2.8-2.6z" />
      </svg>
    </button>
  );
}
