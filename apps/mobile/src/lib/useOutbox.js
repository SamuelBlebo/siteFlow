import { useEffect, useState } from 'react';
import { getOutbox, subscribeOutbox } from './reportOutbox';
import { useAuth } from '../auth/AuthProvider';

// Live list of the signed-in person's reports and issues in the outbox (waiting, sending, sent,
// failed). On a shared phone, someone else's unsent items wait for them to sign in again; only
// they can send them, so they are not shown to (or counted for) anyone else.
export function useOutbox() {
  const uid = useAuth()?.user?.uid;
  return useAllOutbox().filter((x) => x.uid === uid);
}

function useAllOutbox() {
  const [items, setItems] = useState(getOutbox());
  useEffect(() => {
    let stop = () => {};
    let alive = true;
    subscribeOutbox((x) => { if (alive) setItems(x); }).then((un) => { stop = un; });
    return () => { alive = false; stop(); };
  }, []);
  return items;
}
