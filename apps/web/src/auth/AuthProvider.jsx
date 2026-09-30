import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';
import { can as roleCan, isRole } from '@siteflow/shared';
import { auth } from '../firebase';
import { userDoc } from '../lib/db';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let unsubProfile = () => {};
    const unsub = onAuthStateChanged(auth, (u) => {
      unsubProfile();
      setUser(u);
      setError(null);
      if (!u) { setProfile(null); setLoading(false); return; }
      setLoading(true);
      unsubProfile = onSnapshot(
        userDoc(u.uid),
        (s) => { setProfile(s.exists() ? { id: s.id, ...s.data() } : null); setLoading(false); },
        (e) => { console.error('Could not load profile', e); setError(e); setLoading(false); }
      );
    });
    return () => { unsub(); unsubProfile(); };
  }, []);

  // A switched-off account or an unknown role gets no access
  const active = !!profile && profile.active !== false && isRole(profile.role);
  const role = active ? profile.role : null;
  const can = (permission) => roleCan(role, permission);
  return (
    <AuthCtx.Provider value={{ user, profile, loading, error, active, role, can, cid: active ? profile.companyId : null }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
