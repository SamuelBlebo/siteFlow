import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import auth from '@react-native-firebase/auth';
import { can as roleCan, isRole, setLocale } from '@siteflow/shared';
import { companyRef, exists, memberRef, switchCompany as saveSwitch, userRef } from '../lib/db';
import { setSyncUser } from '../lib/sync';

const AuthCtx = createContext(null);

// One login can belong to several companies, with a different role in each. users/{uid} is the
// person and the company they are looking at; companies/{cid}/members/{uid} is their role and
// sites there. profile joins the two, so screens keep using profile.role, profile.siteIds and cid.
// (Accounts from before memberships are moved by the server: on the web app's first sign-in, or by
// the hourly reminder job. Until then this keeps loading.)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [account, setAccount] = useState(undefined); // undefined: loading, null: none
  const [member, setMember] = useState(undefined);
  const [error, setError] = useState(null);
  const [company, setCompany] = useState(null);
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    let unsubAccount = () => {};
    const unsub = auth().onAuthStateChanged((u) => {
      unsubAccount();
      let hadAccount = false;
      setUser(u);
      setError(null);
      setMember(undefined);
      if (!u) { setAccount(null); return; }
      setAccount(undefined);
      unsubAccount = userRef(u.uid).onSnapshot(
        (s) => {
          // Removed from their last company while signed in: sign out
          if (hadAccount && !exists(s) && !s.metadata?.fromCache) { auth().signOut(); return; }
          hadAccount = exists(s);
          setAccount(exists(s) ? { id: s.id, ...s.data() } : null);
        },
        (e) => { console.warn('Could not load profile', e); setError(e); setAccount(null); }
      );
    });
    return () => { unsub(); unsubAccount(); };
  }, []);
  // The write journal shows and sends only the signed-in person's changes
  useEffect(() => setSyncUser(user?.uid), [user?.uid]);

  const uid = user?.uid;
  const legacy = !!account && 'role' in account;
  const current = legacy ? null : account?.companyId || null;
  const idsKey = legacy ? '' : (account?.companyIds || []).join(',');
  const companyIds = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);

  // The membership in the company being looked at
  useEffect(() => {
    if (!uid || !current) { setMember(account === undefined || legacy ? undefined : null); return undefined; }
    setMember(undefined);
    return memberRef(current, uid).onSnapshot((s) => {
      if (!exists(s) && !s.metadata?.fromCache) {
        // Removed from this company: go to another one they belong to
        const next = companyIds.find((c) => c !== current);
        if (next) { saveSwitch(uid, next).catch(() => {}); return; }
      }
      setMember(exists(s) ? s.data() : null);
    }, (e) => { console.warn('Could not load membership', e); setError(e); setMember(null); });
  }, [uid, current, legacy, account === undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  // Names for the company switcher
  useEffect(() => {
    let live = true;
    if (companyIds.length < 2) { setCompanies([]); return undefined; }
    Promise.all(companyIds.map((id) => companyRef(id).get().then((s) => ({ id, name: s.data()?.name || 'Company' })).catch(() => null)))
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

  // The company's country sets currency, time zone and phone format on the phone too
  useEffect(() => {
    if (!cid) { setLocale(null); setCompany(null); return undefined; }
    return companyRef(cid).onSnapshot((s) => { const c = exists(s) ? { id: s.id, ...s.data() } : null; setLocale(c); setCompany(c); },
      (e) => console.warn('Could not load company', e));
  }, [cid]);

  const switchCompany = useCallback((to) => (uid && to !== current ? saveSwitch(uid, to) : Promise.resolve()), [uid, current]);
  // One value object per change, so screens using it only re-render when something in it changes
  const value = useMemo(() => ({
    user, profile, loading, error, active, role, cid, company, companies, switchCompany,
    can: (permission) => roleCan(role, permission),
    signOut: () => auth().signOut(),
  }), [user, profile, loading, error, active, role, cid, company, companies, switchCompany]);
  return (
    <AuthCtx.Provider value={value}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
