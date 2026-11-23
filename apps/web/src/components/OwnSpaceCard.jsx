import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import CompanySetupForm from './CompanySetupForm';

// Every account has its own space (a company it owns). People invited before that was given on
// joining can create theirs here in one go. Shows nothing once they have it.
export const ownsCompany = (profile, uid) => !!uid && (profile?.companyIds || []).includes(uid);
export const ownSpaceName = (name) => {
  const first = String(name || '').trim().split(/\s+/)[0];
  return first ? `${first}'s projects` : 'My projects';
};

// "Not now" hides the card on this device; the New menu and the Account page still offer it
const HIDE_KEY = 'sf.ownSpaceHidden';
const readHidden = () => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } };

export default function OwnSpaceCard() {
  const { user, profile, viewAs } = useAuth();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(readHidden);
  const hide = () => { setHidden(true); try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* private window: this visit only */ } };
  if (hidden || viewAs || !profile || ownsCompany(profile, user?.uid)) return null;
  return (
    <div className="card own-space">
      <h2>Create your own projects</h2>
      <p className="muted small">Run your own jobs too. You'll be the Owner there, and you stay in this company.</p>
      {open
        // The server switches to the new space; a fresh load opens it on Home as its Owner
        ? <CompanySetupForm name={profile.name || ''} companyName={ownSpaceName(profile.name)} idPrefix="ownspace" submitLabel="Create my projects" onDone={() => window.location.assign('/')} />
        : <div className="own-actions"><button type="button" className="btn" onClick={() => setOpen(true)}>Get started</button><button type="button" className="btn ghost" onClick={hide}>Not now</button></div>}
    </div>
  );
}
