import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';
import { can as roleCan, isRole, setLocale } from '@siteflow/shared';
import { auth } from '../firebase';
import { companyDoc, userDoc } from '../lib/db';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [company, setCompany] = useState(null);

  useEffect(() => {
    let unsubProfile = () => {};
    const unsub = onAuthStateChanged(auth, (u) => {
      unsubProfile();
      let hadProfile = false;
      setUser(u);
      setError(null);
      if (!u) { setProfile(null); setLoading(false); return; }
      setLoading(true);
      unsubProfile = onSnapshot(
        userDoc(u.uid),
        (s) => {
          // Removed from the company while signed in: sign out rather than offer to set up a new company
          if (hadProfile && !s.exists() && !s.metadata.fromCache) { signOut(auth); return; }
          hadProfile = s.exists();
          setProfile(s.exists() ? { id: s.id, ...s.data() } : null); setLoading(false);
        },
        (e) => { console.error('Could not load profile', e); setError(e); setLoading(false); }
      );
    });
    return () => { unsub(); unsubProfile(); };
  }, []);

  // A switched-off account or an unknown role gets no access
  const active = !!profile && profile.active !== false && isRole(profile.role);
  const role = active ? profile.role : null;
  const cid = active ? profile.companyId : null;

  // The company's country sets currency, time zone and phone format everywhere. The locale is set
  // before the state changes, so every screen re-renders with it.
  useEffect(() => {
    if (!cid) { setLocale(null); setCompany(null); return undefined; }
    return onSnapshot(companyDoc(cid), (s) => { const c = s.exists() ? { id: s.id, ...s.data() } : null; setLocale(c); setCompany(c); },
      (e) => console.error('Could not load company', e));
  }, [cid]);
  // One value object per change, so screens using it only re-render when something in it changes
  const value = useMemo(() => ({
    user, profile, loading, error, active, role, cid, company,
    can: (permission) => roleCan(role, permission),
  }), [user, profile, loading, error, active, role, cid, company]);
  return (
    <AuthCtx.Provider value={value}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
