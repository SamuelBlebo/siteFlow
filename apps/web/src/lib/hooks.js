import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDocs, onSnapshot, query, startAfter } from 'firebase/firestore';
import { attendanceDoc, expensesQuery, financeDoc, milestonesQuery, sub, todayLogsQuery } from './db';
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

// A long list read a page at a time. makeQuery returns a query ending in limit(pageSize).
// The first page stays live; "more" fetches the next page once, starting after the last item
// already loaded (a cursor), so earlier pages are never downloaded again.
const withPath = (d) => ({ id: d.id, _path: d.ref.path, ...d.data() });
export function usePagedQuery(makeQuery, deps, pageSize) {
  const [first, setFirst] = useState([]);
  const [older, setOlder] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const q = useRef(null);
  const firstLast = useRef(null);  // last document of the live first page
  const olderLast = useRef(null);  // last document fetched with "more"
  const prevFirst = useRef([]);
  useEffect(() => {
    q.current = makeQuery();
    setOlder([]); setError(null); firstLast.current = null; olderLast.current = null; prevFirst.current = [];
    if (!q.current) { setFirst([]); setHasMore(false); setLoading(false); return; }
    setLoading(true);
    return onSnapshot(q.current, (s) => {
      const list = s.docs.map(withPath);
      // Once older pages are loaded, an item pushed off the first page by a new one stays in view
      if (olderLast.current) {
        const now = new Set(list.map((x) => x._path));
        const dropped = prevFirst.current.filter((x) => !now.has(x._path));
        if (dropped.length) setOlder((p) => [...dropped, ...p]);
      } else {
        firstLast.current = s.docs[s.docs.length - 1] || null;
        setHasMore(s.docs.length >= pageSize);
      }
      prevFirst.current = list;
      setFirst(list);
      setLoading(false);
    }, (e) => { console.error(e); setError(e); setLoading(false); });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  const more = useCallback(async () => {
    const cursor = olderLast.current || firstLast.current;
    if (!q.current || !cursor) return;
    setLoadingMore(true);
    try {
      const s = await getDocs(query(q.current, startAfter(cursor)));
      if (s.docs.length) olderLast.current = s.docs[s.docs.length - 1];
      setOlder((p) => [...p, ...s.docs.map(withPath)]);
      setHasMore(s.docs.length >= pageSize);
    } catch (e) { console.error(e); setError(e); } finally { setLoadingMore(false); }
  }, [pageSize]);
  const seen = new Set(first.map((x) => x._path));
  const data = [...first, ...older.filter((x) => !seen.has(x._path))];
  return { data, loading, loadingMore, error, hasMore, more };
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
  const [crew, setCrew] = useState({});
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
      unsubs.push(onSnapshot(sub(cid, sid, 'workers'), (s) => setCrew((p) => ({ ...p, [sid]: toList(s).filter((w) => w.active !== false).length })), fail('workers')));
      if (withFinance) unsubs.push(onSnapshot(financeDoc(cid, sid), (s) => setFinance((p) => ({ ...p, [sid]: s.data() || null })), fail('finance')));
    });
    return () => unsubs.forEach((u) => u());
  }, [cid, key, withFinance]); // eslint-disable-line react-hooks/exhaustive-deps
  return { materials, usage, present, finance, milestones, crew };
}

// Expenses since a date across several sites (finance roles only; the rules refuse others)
export function useExpenses(cid, siteIds, from, enabled) {
  const [bySite, setBySite] = useState({});
  const key = siteIds.join(',');
  useEffect(() => {
    if (!enabled || !cid || !siteIds.length) { setBySite({}); return; }
    const unsubs = siteIds.map((sid) => onSnapshot(expensesQuery(cid, sid, from),
      (s) => setBySite((p) => ({ ...p, [sid]: toList(s) })), (e) => console.error('Dashboard: could not load expenses', e)));
    return () => unsubs.forEach((u) => u());
  }, [cid, key, from, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => Object.values(bySite).flat(), [bySite]);
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
  // Sorted lists are worked out once per change, not on every render of every tab
  const sortedMaterials = useMemo(() => [...materials.data].sort(byName), [materials.data]);
  const sortedWorkers = useMemo(() => [...workers.data].sort(byName), [workers.data]);
  const payById = useMemo(() => Object.fromEntries(pay.data.map((p) => [p.id, p])), [pay.data]);
  const usage = useMemo(() => usageByMaterial(logs.data), [logs.data]);
  return {
    materials: useMemo(() => sortedMaterials.filter((m) => m.active !== false), [sortedMaterials]),
    allMaterials: sortedMaterials,
    workers: useMemo(() => sortedWorkers.filter((w) => w.active !== false), [sortedWorkers]),
    allWorkers: sortedWorkers,
    pay: payById,
    usage,
    logs: logs.data,
    marks,
    presentCount: presentCount(marks),
    loading: materials.loading || workers.loading || attendance.loading,
    error: materials.error || workers.error || attendance.error || logs.error || pay.error,
  };
}

// The browser tab title for a page ("Sites · SiteFlow"), so tabs, history and screen readers say where you are
export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · SiteFlow` : 'SiteFlow';
  }, [title]);
}
