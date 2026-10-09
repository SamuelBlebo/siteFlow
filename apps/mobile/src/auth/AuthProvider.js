import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import auth from '@react-native-firebase/auth';
import { can as roleCan, isRole, setLocale } from '@siteflow/shared';
import { companyRef, exists, userRef } from '../lib/db';
import { setSyncUser } from '../lib/sync';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [company, setCompany] = useState(null);

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
  // The write journal shows and sends only the signed-in person's changes
  useEffect(() => setSyncUser(user?.uid), [user?.uid]);

  // A switched-off account or an unknown role gets no access
  const active = !!profile && profile.active !== false && isRole(profile.role);
  const role = active ? profile.role : null;
  const cid = active ? profile.companyId : null;

  // The company's country sets currency, time zone and phone format on the phone too
  useEffect(() => {
    if (!cid) { setLocale(null); setCompany(null); return undefined; }
    return companyRef(cid).onSnapshot((s) => { const c = exists(s) ? { id: s.id, ...s.data() } : null; setLocale(c); setCompany(c); },
      (e) => console.warn('Could not load company', e));
  }, [cid]);
  // One value object per change, so screens using it only re-render when something in it changes
  const value = useMemo(() => ({
    user, profile, loading, error, active, role, cid, company,
    can: (permission) => roleCan(role, permission),
    signOut: () => auth().signOut(),
  }), [user, profile, loading, error, active, role, cid, company]);
  return (
    <AuthCtx.Provider value={value}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
