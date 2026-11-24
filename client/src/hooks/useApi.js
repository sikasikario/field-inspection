import { useCallback, useEffect, useState } from 'react';

/** Încarcă date de la API, cu stări de încărcare și eroare. */
export function useApi(fetcher, deps = []) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    return fetcher()
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((error) => setState({ loading: false, error, data: null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}
