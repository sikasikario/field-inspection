import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { Loading, ErrorBox } from '../../components/Feedback.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { formatDateTime } from '../../lib/labels.js';

const DELIVERY_LABELS = { PENDING: 'În curs', SENT: 'Trimisă', FAILED: 'Eșuată' };

export function Reports() {
  const summary = useApi(() => api.get('/reports/summary'));
  const deliveries = useApi(() => api.get('/deliveries'));
  const [retryError, setRetryError] = useState(null);

  async function retry(id) {
    setRetryError(null);
    try {
      await api.post(`/deliveries/${id}/retry`);
      deliveries.reload();
    } catch (err) {
      setRetryError(err);
    }
  }

  return (
    <>
      <h1>Raport central</h1>
      <ErrorBox error={summary.error} onRetry={summary.reload} />
      {summary.loading && !summary.data && <Loading />}
      {summary.data && (
        <>
          <div className="stats">
            <div className="card stat"><span className="stat-value">{summary.data.total}</span><span className="muted">inspecții în total</span></div>
            {Object.entries(summary.data.byStatus).map(([status, count]) => (
              <div key={status} className="card stat"><span className="stat-value">{count}</span><StatusBadge status={status} /></div>
            ))}
          </div>
          <h2>Pe locații</h2>
          <div className="table-wrap card">
            <table className="table">
              <thead><tr><th>Locație</th><th>Inspecții</th><th>Neconformități („nu”)</th></tr></thead>
              <tbody>
                {summary.data.bySite.map((s) => (
                  <tr key={s.siteId}><td>{s.siteName}</td><td>{s.inspections}</td><td>{s.nonConformities}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="page-head">
        <h2>Livrări către registrul extern</h2>
        <button type="button" className="btn btn-small" onClick={deliveries.reload}>Reîmprospătează</button>
      </div>
      <ErrorBox error={deliveries.error || retryError} onRetry={deliveries.error ? deliveries.reload : undefined} />
      {deliveries.data && (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr><th>Inspecție</th><th>Stare</th><th>Încercări</th><th>Referință registru</th><th>Ultima eroare</th><th>Următoarea încercare</th><th /></tr></thead>
            <tbody>
              {deliveries.data.items.map((d) => (
                <tr key={d.id}>
                  <td className="small"><code>{d.inspectionId.slice(0, 8)}</code></td>
                  <td><span className={`chip chip-${d.state.toLowerCase()}`}>{DELIVERY_LABELS[d.state]}</span></td>
                  <td>{d.attempts}</td>
                  <td>{d.externalRef ?? '—'}</td>
                  <td className="small">{d.lastError ?? '—'}</td>
                  <td className="small">{formatDateTime(d.nextAttemptAt)}</td>
                  <td>{d.state === 'FAILED' && <button type="button" className="btn btn-small" onClick={() => retry(d.id)}>Reia</button>}</td>
                </tr>
              ))}
              {deliveries.data.items.length === 0 && <tr><td colSpan={7} className="muted">Nicio inspecție aprobată încă.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
