import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { sub, todayLogsQuery, attendanceDoc } from './db';
import { usageByMaterial } from '@siteflow/shared';

const toList = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));

// Live list. makeQuery returns a Firestore query or a falsy value to skip.
export function useQuery(makeQuery, deps) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    const q = makeQuery();
    if (!q) { setData([]); setLoading(false); return; }
    setLoading(true);
    return onSnapshot(q, (s) => { setData(toList(s)); setLoading(false); }, (e) => { console.error(e); setError(e); setLoading(false); });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, loading, error };
}

// Live single document
export function useDoc(makeRef, deps) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const r = makeRef();
    if (!r) { setLoading(false); return; }
    setLoading(true);
    return onSnapshot(r, (s) => { setData(s.exists() ? { id: s.id, ...s.data() } : null); setLoading(false); }, () => setLoading(false));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, loading };
}

// Materials, today's usage and today's attendance count for many sites (owner dashboard)
export function useSiteSignals(cid, siteIds) {
  const [materials, setMaterials] = useState({});
  const [usage, setUsage] = useState({});
  const [present, setPresent] = useState({});
  const key = siteIds.join(',');
  useEffect(() => {
    if (!cid || !siteIds.length) return;
    const unsubs = [];
    siteIds.forEach((sid) => {
      unsubs.push(onSnapshot(sub(cid, sid, 'materials'), (s) => setMaterials((p) => ({ ...p, [sid]: toList(s) }))));
      unsubs.push(onSnapshot(todayLogsQuery(cid, sid), (s) => setUsage((p) => ({ ...p, [sid]: usageByMaterial(toList(s)) }))));
      unsubs.push(onSnapshot(attendanceDoc(cid, sid), (s) => setPresent((p) => ({ ...p, [sid]: s.exists() ? s.data().count || 0 : 0 }))));
    });
    return () => unsubs.forEach((u) => u());
  }, [cid, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { materials, usage, present };
}

// Everything one site workspace needs
export function useSiteData(cid, sid) {
  const materials = useQuery(() => cid && sid && sub(cid, sid, 'materials'), [cid, sid]);
  const workers = useQuery(() => cid && sid && sub(cid, sid, 'workers'), [cid, sid]);
  const logs = useQuery(() => cid && sid && todayLogsQuery(cid, sid), [cid, sid]);
  const attendance = useDoc(() => cid && sid && attendanceDoc(cid, sid), [cid, sid]);
  const present = attendance.data?.present || {};
  return {
    materials: materials.data,
    workers: workers.data.filter((w) => w.active !== false),
    usage: usageByMaterial(logs.data),
    attendance: attendance.data,
    presentCount: Object.values(present).filter(Boolean).length,
    loading: materials.loading || workers.loading,
  };
}
