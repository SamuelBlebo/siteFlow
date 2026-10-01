import { useEffect, useState } from 'react';
import { getOutbox, subscribeOutbox } from './reportOutbox';

// Live list of reports in the outbox (waiting, sending, sent, failed)
export function useOutbox() {
  const [items, setItems] = useState(getOutbox());
  useEffect(() => {
    let stop = () => {};
    let alive = true;
    subscribeOutbox((x) => { if (alive) setItems(x); }).then((un) => { stop = un; });
    return () => { alive = false; stop(); };
  }, []);
  return items;
}
