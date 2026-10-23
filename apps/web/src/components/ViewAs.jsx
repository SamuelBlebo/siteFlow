import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, viewAsPeople, viewAsRoles } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { teamQuery } from '../lib/db';
import { useQuery } from '../lib/hooks';
import Icon from './Icons';

// View as (owners and admins): see the app as a role, or as one person on the team. A preview
// only: nothing can be saved while it is on, and the security rules still apply the real role.

// The bar across the top of every page while previewing. "Back to my view" is always one tap away.
export function ViewAsBar() {
  const { viewAs, stopViewAs } = useAuth();
  const [choosing, setChoosing] = useState(false);
  if (!viewAs) return null;
  return (
    <div className="viewas-bar" role="status">
      <Icon name="eye" />
      <span className="grow">Viewing as <b>{viewAs.label}</b><small>Look only. Nothing is saved.</small></span>
      <button type="button" className="btn ghost sm" onClick={() => setChoosing(true)}>Switch</button>
      <button type="button" className="btn sm" onClick={stopViewAs}>Back to my view</button>
      {choosing && <ViewAsChooser onClose={() => setChoosing(false)} />}
    </div>
  );
}

// Pick a role, or a person (their role and their projects)
export function ViewAsChooser({ onClose }) {
  const { cid, realRole, user, viewAs, startViewAs } = useAuth();
  const { data: members, loading } = useQuery(() => cid && teamQuery(cid), [cid]);
  const [q, setQ] = useState('');
  const box = useRef(null);
  useEffect(() => {
    box.current?.focus();
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const roles = viewAsRoles(realRole);
  const term = q.trim().toLowerCase();
  const people = viewAsPeople(realRole, members, user?.uid)
    .filter((m) => !term || `${m.name} ${m.email || ''} ${ROLE_LABELS[m.role]}`.toLowerCase().includes(term));
  const pick = (v) => { startViewAs(v); onClose(); };

  // On the page itself, so it sits above the sticky bars and the phone menu
  return createPortal(
    <div className="viewas-bg" onClick={onClose}>
      <div className="viewas-box" role="dialog" aria-modal="true" aria-labelledby="viewas-title" tabIndex={-1} ref={box} onClick={(e) => e.stopPropagation()}>
        <div className="viewas-h">
          <b id="viewas-title">View as</b>
          <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>
        <p className="muted small">See SiteFlow the way someone on your team does. It is a preview: nothing can be saved until you go back to your view.</p>

        <p className="viewas-lbl">A role</p>
        <ul className="viewas-list">
          {roles.map((r) => (
            <li key={r}>
              <button type="button" aria-current={viewAs?.kind === 'role' && viewAs.role === r} onClick={() => pick({ kind: 'role', role: r })}>
                <b>{ROLE_LABELS[r]}</b><small>{ROLE_DESCRIPTIONS[r]}</small>
              </button>
            </li>
          ))}
        </ul>

        <p className="viewas-lbl">A person</p>
        <div className="field"><input type="search" placeholder="Search the team" aria-label="Search the team" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {loading ? <p className="muted small">Loading the team…</p>
          : !people.length ? <p className="muted small">{term ? 'Nobody matches that search.' : 'Nobody on the team you can view as yet.'}</p>
            : (
              <ul className="viewas-list">
                {people.map((m) => (
                  <li key={m.id}>
                    <button type="button" aria-current={viewAs?.kind === 'person' && viewAs.uid === m.id}
                      onClick={() => pick({ kind: 'person', uid: m.id, name: m.name, role: m.role, siteIds: m.siteIds || [] })}>
                      <b>{m.name}</b><small>{ROLE_LABELS[m.role]}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
      </div>
    </div>,
    document.body,
  );
}
