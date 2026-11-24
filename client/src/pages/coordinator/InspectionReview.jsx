import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { Loading, ErrorBox } from '../../components/Feedback.jsx';
import { formatDate, formatDateTime } from '../../lib/labels.js';

export function InspectionReview() {
  const { id } = useParams();
  const res = useApi(async () => {
    const [inspection, templates] = await Promise.all([api.get(`/inspections/${id}`), api.get('/templates')]);
    return { inspection, template: templates.items.find((t) => t.id === inspection.templateId) };
  }, [id]);
  const [comment, setComment] = useState('');
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (res.loading && !res.data) return <Loading />;
  if (res.error) return <ErrorBox error={res.error} onRetry={res.reload} />;
  const { inspection, template } = res.data;
  const answers = Object.fromEntries(inspection.answers.map((a) => [a.itemId, a.value]));

  async function decide(action) {
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/inspections/${id}/transitions`, { action, baseVersion: inspection.version, comment: comment.trim() || undefined });
      setComment('');
      await res.reload();
    } catch (err) {
      setActionError(err);
      if (err.code === 'VERSION_CONFLICT') await res.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article>
      <p><Link to="/">‹ Inspecții</Link></p>
      <div className="page-head">
        <div>
          <h1>{inspection.site?.name}</h1>
          <p className="muted">{inspection.template?.title} · {inspection.inspector?.name} · termen {formatDate(inspection.dueDate)}</p>
        </div>
        <StatusBadge status={inspection.status} />
      </div>
      <p className="muted small">Trimisă: {formatDateTime(inspection.submittedAt)} · Decizie: {formatDateTime(inspection.decidedAt)} · versiunea {inspection.version}</p>
      {inspection.decisionComment && <div className="alert alert-warn"><strong>Comentariu:</strong> {inspection.decisionComment}</div>}
      {inspection.notes && <p className="card"><strong>Notițe inspector:</strong> {inspection.notes}</p>}

      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>Întrebare</th><th>Răspuns</th></tr></thead>
          <tbody>
            {template?.items.map((it) => (
              <tr key={it.id} className={answers[it.id] === 'nu' ? 'row-warn' : ''}>
                <td>{it.position}. {it.label}</td>
                <td>{answers[it.id] ?? <span className="muted">fără răspuns</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {inspection.status === 'SUBMITTED' && (
        <div className="card form">
          <h2>Decizie</h2>
          <label>Comentariu (obligatoriu la respingere)
            <textarea value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} />
          </label>
          <ErrorBox error={actionError} />
          <div className="btn-row">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => decide('approve')}>Aprobă</button>
            <button type="button" className="btn btn-danger" disabled={busy || !comment.trim()} onClick={() => decide('reject')}>Respinge</button>
          </div>
        </div>
      )}
    </article>
  );
}
