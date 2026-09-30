import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { exists, siteRef, sub, toList } from '../lib/db';
import { todayKey } from '@siteflow/shared';

const SiteCtx = createContext(null);

export function SiteProvider({ sid, children }) {
  const { cid } = useAuth();
  const [site, setSite] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [attendance, setAttendance] = useState(null);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (!cid || !sid) return;
    const unsubs = [
      siteRef(cid, sid).onSnapshot((s) => setSite(exists(s) ? { id: s.id, ...s.data() } : null)),
      sub(cid, sid, 'materials').onSnapshot((s) => setMaterials(toList(s))),
      sub(cid, sid, 'workers').onSnapshot((s) => setWorkers(toList(s).filter((w) => w.active !== false))),
      sub(cid, sid, 'attendance').doc(todayKey()).onSnapshot((s) => setAttendance(exists(s) ? s.data() : null)),
      sub(cid, sid, 'materialLogs').where('date', '==', todayKey()).onSnapshot((s) => setLogs(toList(s))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [cid, sid]);

  const present = attendance?.present || {};
  const usage = logs.filter((l) => l.type === 'usage')
    .reduce((acc, l) => ({ ...acc, [l.materialId]: (acc[l.materialId] || 0) + l.qty }), {});

  return (
    <SiteCtx.Provider value={{
      cid, sid, site, materials, workers, attendance, present, usage,
      presentCount: Object.values(present).filter(Boolean).length,
    }}>
      {children}
    </SiteCtx.Provider>
  );
}

export const useSite = () => useContext(SiteCtx);
