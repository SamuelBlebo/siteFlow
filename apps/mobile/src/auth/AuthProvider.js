import { createContext, useContext, useEffect, useState } from 'react';
import auth from '@react-native-firebase/auth';
import { exists, userRef } from '../lib/db';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile = () => {};
    const unsub = auth().onAuthStateChanged((u) => {
      unsubProfile();
      setUser(u);
      if (!u) { setProfile(null); setLoading(false); return; }
      setLoading(true);
      unsubProfile = userRef(u.uid).onSnapshot(
        (s) => { setProfile(exists(s) ? { id: s.id, ...s.data() } : null); setLoading(false); },
        () => setLoading(false)
      );
    });
    return () => { unsub(); unsubProfile(); };
  }, []);

  const isAdmin = !!profile && ['owner', 'manager'].includes(profile.role);
  return (
    <AuthCtx.Provider value={{ user, profile, loading, isAdmin, cid: profile?.companyId, signOut: () => auth().signOut() }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
