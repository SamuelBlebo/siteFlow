import { useEffect, useState } from 'react';
import { dismiss, getState, subscribe } from '../lib/save';

// Toasts for saves that fail after syncing, plus an offline / saving indicator
export default function Toaster() {
  const [s, setS] = useState(getState());
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => subscribe(setS), []);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  return (
    <div className="toasts" aria-live="polite">
      {!online && (
        <div className="toast warn">
          Offline. {s.pending ? `${s.pending} change${s.pending === 1 ? '' : 's'} waiting to sync.` : 'Changes are saved on this device and sync when you reconnect.'}
        </div>
      )}
      {online && s.pending > 0 && <div className="toast">Syncing {s.pending} change{s.pending === 1 ? '' : 's'}…</div>}
      {s.toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'err' ? 'alert' : 'status'}>
          <span>{t.message}</span>
          <button className="linkbtn" onClick={() => dismiss(t.id)} aria-label="Dismiss">Close</button>
        </div>
      ))}
    </div>
  );
}
