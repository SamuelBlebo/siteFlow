import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import auth from '@react-native-firebase/auth';
import { can as roleCan, isRole } from '@siteflow/shared';
import { exists, userRef } from '../lib/db';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let unsubProfile = () => {};
    const unsub = auth().onAuthStateChanged((u) => {
      unsubProfile();
      let hadProfile = false;
      setUser(u);
      setError(null);
      if (!u) { setProfile(null); setLoading(false); return; }
      setLoading(true);
      unsubProfile = userRef(u.uid).onSnapshot(
        (s) => {
          // Removed from the company while signed in: sign out
          if (hadProfile && !exists(s) && !s.metadata?.fromCache) { auth().signOut(); return; }
          hadProfile = exists(s);
          setProfile(exists(s) ? { id: s.id, ...s.data() } : null); setLoading(false);
        },
        (e) => { console.warn('Could not load profile', e); setError(e); setLoading(false); }
      );
    });
    return () => { unsub(); unsubProfile(); };
  }, []);

  // A switched-off account or an unknown role gets no access
  const active = !!profile && profile.active !== false && isRole(profile.role);
  const role = active ? profile.role : null;
  // One value object per change, so screens using it only re-render when something in it changes
  const value = useMemo(() => ({
    user, profile, loading, error, active, role, cid: active ? profile.companyId : null,
    can: (permission) => roleCan(role, permission),
    signOut: () => auth().signOut(),
  }), [user, profile, loading, error, active, role]);
  return (
    <AuthCtx.Provider value={value}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
