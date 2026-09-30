import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile = () => {};
    const unsub = onAuthStateChanged(auth, (u) => {
      unsubProfile();
      setUser(u);
      if (!u) { setProfile(null); setLoading(false); return; }
      setLoading(true);
      unsubProfile = onSnapshot(
        doc(db, 'users', u.uid),
        (s) => { setProfile(s.exists() ? { id: s.id, ...s.data() } : null); setLoading(false); },
        () => setLoading(false)
      );
    });
    return () => { unsub(); unsubProfile(); };
  }, []);

  const isAdmin = !!profile && ['owner', 'manager'].includes(profile.role);
  return (
    <AuthCtx.Provider value={{ user, profile, loading, isAdmin, cid: profile?.companyId }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
