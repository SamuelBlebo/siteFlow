import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { getDoc, onSnapshot } from 'firebase/firestore';
import { can as roleCan, isRole, setLocale } from '@siteflow/shared';
import { auth } from '../firebase';
import { companyDoc, memberDoc, switchCompany as saveSwitch, userDoc } from '../lib/db';
import { migrateAccount } from '../lib/account';

const AuthCtx = createContext(null);

// One login can belong to several companies, with a different role in each. users/{uid} is the
// person and the company they are looking at; companies/{cid}/members/{uid} is their role and
// projects there. profile joins the two, so screens keep using profile.role, profile.siteIds and cid.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [account, setAccount] = useState(undefined); // undefined: loading, null: none yet
  const [member, setMember] = useState(undefined);
  const [error, setError] = useState(null);
  const [company, setCompany] = useState(null);
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    let unsubAccount = () => {};
    const unsub = onAuthStateChanged(auth, (u) => {
      unsubAccount();
      let hadAccount = false;
      setUser(u);
      setError(null);
      setMember(undefined);
      if (!u) { setAccount(null); return; }
      setAccount(undefined);
      unsubAccount = onSnapshot(
        userDoc(u.uid),
        (s) => {
          // Removed from their last company while signed in: sign out rather than offer to set up a new one
          if (hadAccount && !s.exists() && !s.metadata.fromCache) { signOut(auth); return; }
          hadAccount = s.exists();
          const a = s.exists() ? { id: s.id, ...s.data() } : null;
          // Older layout (role on the person): the server moves the company to memberships, then this updates
          if (a && 'role' in a && !s.metadata.fromCache) migrateAccount().catch((e) => { console.error('Could not move account', e); setError(e); });
          setAccount(a);
        },
        (e) => { console.error('Could not load profile', e); setError(e); setAccount(null); }
      );
    });
    return () => { unsub(); unsubAccount(); };
  }, []);

  const uid = user?.uid;
  const legacy = !!account && 'role' in account;
  const current = legacy ? null : account?.companyId || null;
  const companyIds = useMemo(() => (legacy ? [] : account?.companyIds || []), [legacy, account?.companyIds?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // The membership in the company being looked at
  useEffect(() => {
    if (!uid || !current) { setMember(account === undefined || legacy ? undefined : null); return undefined; }
    setMember(undefined);
    return onSnapshot(memberDoc(current, uid), (s) => {
      if (!s.exists() && !s.metadata.fromCache) {
        // Removed from this company: go to another one they belong to
        const next = companyIds.find((c) => c !== current);
        if (next) { saveSwitch(uid, next).catch(() => {}); return; }
      }
      setMember(s.exists() ? s.data() : null);
    }, (e) => { console.error('Could not load membership', e); setError(e); setMember(null); });
  }, [uid, current, legacy, account === undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  // Names for the company switcher
  useEffect(() => {
    let live = true;
    if (companyIds.length < 2) { setCompanies([]); return undefined; }
    Promise.all(companyIds.map((id) => getDoc(companyDoc(id)).then((s) => ({ id, name: s.data()?.name || 'Company' })).catch(() => null)))
      .then((list) => live && setCompanies(list.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))));
    return () => { live = false; };
  }, [companyIds]);

  const profile = useMemo(() => (account && member ? {
    ...member, id: account.id, companyId: current, companyIds,
    name: member.name || account.name, email: member.email || account.email || '', phone: member.phone ?? account.phone,
    mustChangePassword: account.mustChangePassword,
  } : null), [account, member, current, companyIds]);
  const loading = !!user && !error && (account === undefined || legacy || (!!current && member === undefined));

  // A switched-off membership or an unknown role gets no access
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

  const switchCompany = useCallback((to) => (uid && to !== current ? saveSwitch(uid, to) : Promise.resolve()), [uid, current]);
  // One value object per change, so screens using it only re-render when something in it changes
  const value = useMemo(() => ({
    user, profile, loading, error, active, role, cid, company, companies, switchCompany,
    can: (permission) => roleCan(role, permission),
  }), [user, profile, loading, error, active, role, cid, company, companies, switchCompany]);
  return (
    <AuthCtx.Provider value={value}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
