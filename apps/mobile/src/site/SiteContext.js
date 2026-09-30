import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { attendanceRef, exists, siteRef, sub, toList, todayLogsQuery } from '../lib/db';
import { presentCount, usageByMaterial } from '@siteflow/shared';

const SiteCtx = createContext(null);

export function SiteProvider({ sid, children }) {
  const { cid, can } = useAuth();
  const withPay = can('finance.view');
  const [site, setSite] = useState(undefined); // undefined = loading, null = missing or no access
  const [materials, setMaterials] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [pay, setPay] = useState({});
  const [attendance, setAttendance] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!cid || !sid) return;
    const fail = (what) => (e) => { console.warn(`Could not load ${what}`, e); setError(e); };
    const unsubs = [
      siteRef(cid, sid).onSnapshot((s) => setSite(exists(s) ? { id: s.id, ...s.data() } : null), (e) => { fail('site')(e); setSite(null); }),
      sub(cid, sid, 'materials').onSnapshot((s) => setMaterials(toList(s)), fail('materials')),
      sub(cid, sid, 'workers').onSnapshot((s) => setWorkers(toList(s).filter((w) => w.active !== false)), fail('workers')),
      attendanceRef(cid, sid).onSnapshot((s) => setAttendance(exists(s) ? s.data() : null), fail('attendance')),
      todayLogsQuery(cid, sid).onSnapshot((s) => setLogs(toList(s)), fail('material logs')),
    ];
    if (withPay) unsubs.push(sub(cid, sid, 'workerPay').onSnapshot((s) => setPay(Object.fromEntries(toList(s).map((p) => [p.id, p]))), fail('pay')));
    return () => unsubs.forEach((u) => u());
  }, [cid, sid, withPay]);

  const present = attendance?.present || {};
  return (
    <SiteCtx.Provider value={{
      cid, sid, site, loading: site === undefined, error, materials, workers, pay: withPay ? pay : null,
      attendance, present, usage: usageByMaterial(logs), presentCount: presentCount(present),
    }}>
      {children}
    </SiteCtx.Provider>
  );
}

export const useSite = () => useContext(SiteCtx);
