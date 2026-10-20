import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROLE_LABELS, longToday } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { logOut } from '../lib/account';
import Icon from './Icons';
import SkinPicker from './SkinPicker';
import ThemeSwitch from './ThemeSwitch';

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// The slim bar above every page: the time and date, and you (your account, skin, theme, sign out)
export default function TopBar() {
  const [time, setTime] = useState(clock);
  useEffect(() => { const t = setInterval(() => setTime(clock()), 15000); return () => clearInterval(t); }, []);
  return (
    <div className="topbar">
      <span className="tchip"><Icon name="clock" />{time}</span>
      <span className="tchip date"><Icon name="calendar" />{longToday()}</span>
      <span className="grow" />
      <UserMenu />
    </div>
  );
}

function UserMenu() {
  const { user, profile, role } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div className="umenu" ref={box}>
      <button type="button" className="ubtn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>
        <span className="avatar">{initials(profile?.name)}</span>
        <span className="who-text"><b>{profile?.name}</b><span>{role ? ROLE_LABELS[role] : ''}</span></span>
        <Icon name="chevron" />
      </button>
      {open && (
        <div className="upanel">
          <div className="uhead"><b>{profile?.name}</b><small>{user?.email}</small></div>
          <Link to="/account" onClick={close}><Icon name="account" />Your account</Link>
          <Link to="/account#emails" onClick={close}><Icon name="mail" />Email settings</Link>
          <div className="ulbl">Skin</div>
          <SkinPicker />
          <div className="ulbl">Light or dark</div>
          <ThemeSwitch />
          <button type="button" className="uout" onClick={logOut}><Icon name="signout" />Sign out</button>
        </div>
      )}
    </div>
  );
}
