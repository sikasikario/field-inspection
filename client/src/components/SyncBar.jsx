import { useSyncState } from '../hooks/useSync.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { syncEngine } from '../lib/syncEngine.js';
import { formatDateTime } from '../lib/labels.js';

// Bara de stare a sincronizării: câte modificări așteaptă și când a fost ultima sincronizare.
export function SyncBar() {
  const s = useSyncState();
  const online = useOnlineStatus();
  if (!s.ready) return null;

  let text;
  if (s.syncing) text = 'Se sincronizează…';
  else if (s.pending > 0) text = `${s.pending} ${s.pending === 1 ? 'modificare nesincronizată' : 'modificări nesincronizate'}`;
  else text = 'Totul este sincronizat';

  return (
    <div className={`syncbar ${s.pending > 0 ? 'syncbar-pending' : ''}`} data-testid="syncbar">
      <span>
        <strong>{text}</strong>
        <span className="muted"> · ultima sincronizare: {formatDateTime(s.lastSync)}</span>
      </span>
      {s.lastError && <span className="syncbar-error">{s.lastError}{!online && ' (offline)'}</span>}
      <button type="button" className="btn btn-small" onClick={() => syncEngine.sync()} disabled={s.syncing || s.needsLogin}>
        Sincronizează acum
      </button>
    </div>
  );
}
