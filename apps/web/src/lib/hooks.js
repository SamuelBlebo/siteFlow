import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { attendanceDoc, financeDoc, milestonesQuery, sub, todayLogsQuery } from './db';
import { presentCount, usageByMaterial } from '@siteflow/shared';

const toList = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));

// Live list. makeQuery returns a Firestore query or a falsy value to skip.
export function useQuery(makeQuery, deps) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    const q = makeQuery();
    if (!q) { setData([]); setLoading(false); return; }
    setLoading(true); setError(null);
    return onSnapshot(q, (s) => { setData(toList(s)); setLoading(false); }, (e) => { console.error(e); setError(e); setLoading(false); });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, loading, error };
}

// Live single document
export function useDoc(makeRef, deps) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    const r = makeRef();
    if (!r) { setData(null); setLoading(false); return; }
    setLoading(true); setError(null);
    return onSnapshot(r, (s) => { setData(s.exists() ? { id: s.id, ...s.data() } : null); setLoading(false); },
      (e) => { console.error(e); setError(e); setLoading(false); });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, loading, error };
}

// Materials, today's usage, today's attendance and (for finance roles) money, for many sites
export function useSiteSignals(cid, siteIds, { withFinance = false } = {}) {
  const [materials, setMaterials] = useState({});
  const [usage, setUsage] = useState({});
  const [present, setPresent] = useState({});
  const [finance, setFinance] = useState({});
  const [milestones, setMilestones] = useState({});
  const key = siteIds.join(',');
  useEffect(() => {
    if (!cid || !siteIds.length) return;
    const fail = (what) => (e) => console.error(`Dashboard: could not load ${what}`, e);
    const unsubs = [];
    siteIds.forEach((sid) => {
      unsubs.push(onSnapshot(sub(cid, sid, 'materials'), (s) => setMaterials((p) => ({ ...p, [sid]: toList(s) })), fail('materials')));
      unsubs.push(onSnapshot(todayLogsQuery(cid, sid), (s) => setUsage((p) => ({ ...p, [sid]: usageByMaterial(toList(s)) })), fail('usage')));
      unsubs.push(onSnapshot(attendanceDoc(cid, sid), (s) => setPresent((p) => ({ ...p, [sid]: presentCount(s.data()?.marks) })), fail('attendance')));
      unsubs.push(onSnapshot(milestonesQuery(cid, sid), (s) => setMilestones((p) => ({ ...p, [sid]: toList(s) })), fail('milestones')));
      if (withFinance) unsubs.push(onSnapshot(financeDoc(cid, sid), (s) => setFinance((p) => ({ ...p, [sid]: s.data() || null })), fail('finance')));
    });
    return () => unsubs.forEach((u) => u());
  }, [cid, key, withFinance]); // eslint-disable-line react-hooks/exhaustive-deps
  return { materials, usage, present, finance, milestones };
}

const byName = (a, b) => (a.name || '').localeCompare(b.name || '');

// Everything one site workspace needs. Pay is only loaded for roles that may see it.
export function useSiteData(cid, sid, { withPay = false } = {}) {
  const materials = useQuery(() => cid && sid && sub(cid, sid, 'materials'), [cid, sid]);
  const workers = useQuery(() => cid && sid && sub(cid, sid, 'workers'), [cid, sid]); // all, including switched off
  const pay = useQuery(() => withPay && cid && sid && sub(cid, sid, 'workerPay'), [cid, sid, withPay]);
  const logs = useQuery(() => cid && sid && todayLogsQuery(cid, sid), [cid, sid]);
  const attendance = useDoc(() => cid && sid && attendanceDoc(cid, sid), [cid, sid]);
  const marks = attendance.data?.marks || {};
  return {
    materials: materials.data.filter((m) => m.active !== false).sort(byName),
    allMaterials: [...materials.data].sort(byName),
    workers: workers.data.filter((w) => w.active !== false).sort(byName),
    allWorkers: [...workers.data].sort(byName),
    pay: Object.fromEntries(pay.data.map((p) => [p.id, p])),
    usage: usageByMaterial(logs.data),
    logs: logs.data,
    marks,
    presentCount: presentCount(marks),
    loading: materials.loading || workers.loading || attendance.loading,
    error: materials.error || workers.error || attendance.error || logs.error || pay.error,
  };
}
