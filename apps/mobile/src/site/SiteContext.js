import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { attendanceRef, exists, milestonesQuery, siteRef, sub, toList, todayLogsQuery } from '../lib/db';
import { isSiteOpen, presentCount, usageByMaterial } from '@siteflow/shared';

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
  const [milestones, setMilestones] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!cid || !sid) return;
    const fail = (what) => (e) => { console.warn(`Could not load ${what}`, e); setError(e); };
    const unsubs = [
      siteRef(cid, sid).onSnapshot((s) => setSite(exists(s) ? { id: s.id, ...s.data() } : null), (e) => { fail('site')(e); setSite(null); }),
      sub(cid, sid, 'materials').onSnapshot((s) => setMaterials(toList(s).filter((m) => m.active !== false).sort((a, b) => a.name.localeCompare(b.name))), fail('materials')),
      sub(cid, sid, 'workers').onSnapshot((s) => setWorkers(toList(s).filter((w) => w.active !== false).sort((a, b) => a.name.localeCompare(b.name))), fail('workers')),
      attendanceRef(cid, sid).onSnapshot((s) => setAttendance(exists(s) ? s.data() : null), fail('attendance')),
      todayLogsQuery(cid, sid).onSnapshot((s) => setLogs(toList(s)), fail('material logs')),
      milestonesQuery(cid, sid).onSnapshot((s) => setMilestones(toList(s)), fail('milestones')),
    ];
    if (withPay) unsubs.push(sub(cid, sid, 'workerPay').onSnapshot((s) => setPay(Object.fromEntries(toList(s).map((p) => [p.id, p]))), fail('pay')));
    return () => unsubs.forEach((u) => u());
  }, [cid, sid, withPay]);

  const canWorkRole = can('site.work');
  // Rebuilt only when one of the site's records changes, not on every render
  const value = useMemo(() => {
    const marks = attendance?.marks || {};
    return {
      cid, sid, site, loading: site === undefined, error,
      // Daily site work needs the role and an open (not closed) site; the rules check both
      canWork: canWorkRole && isSiteOpen(site), materials, workers, pay: withPay ? pay : null,
      attendance, marks, logs, milestones, usage: usageByMaterial(logs), presentCount: presentCount(marks),
    };
  }, [cid, sid, site, error, canWorkRole, materials, workers, withPay, pay, attendance, logs, milestones]);
  return (
    <SiteCtx.Provider value={value}>
      {children}
    </SiteCtx.Provider>
  );
}

export const useSite = () => useContext(SiteCtx);
