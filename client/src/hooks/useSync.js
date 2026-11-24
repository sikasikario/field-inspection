import { useEffect, useState } from 'react';
import { syncEngine } from '../lib/syncEngine.js';

export function useSyncState() {
  const [state, setState] = useState(syncEngine.state);
  useEffect(() => syncEngine.subscribe(setState), []);
  return state;
}

/** Reîncarcă datele locale de fiecare dată când motorul de sincronizare se schimbă. */
export function useLocalData(loader, deps = []) {
  const [data, setData] = useState(null);
  const sync = useSyncState();
  useEffect(() => {
    let alive = true;
    if (sync.ready) loader().then((d) => alive && setData(d));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync, ...deps]);
  return data;
}
