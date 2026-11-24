import { useState } from 'react';
import { Link } from 'react-router-dom';
import { syncEngine } from '../../lib/syncEngine.js';
import { useLocalData } from '../../hooks/useSync.js';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { Loading } from '../../components/Feedback.jsx';
import { formatDate } from '../../lib/labels.js';

const TABS = {
  todo: { label: 'De făcut', statuses: ['ASSIGNED', 'IN_PROGRESS', 'REJECTED'] },
  submitted: { label: 'Trimise', statuses: ['SUBMITTED'] },
  approved: { label: 'Aprobate', statuses: ['APPROVED'] },
  all: { label: 'Toate', statuses: null },
};

// Lista inspectorului: citită din baza locală, deci funcționează și offline.
export function MyInspections() {
  const [tab, setTab] = useState('todo');
  const inspections = useLocalData(() => syncEngine.listInspections());

  if (!inspections) return <Loading />;
  const { statuses } = TABS[tab];
  const visible = inspections
    .filter((i) => !statuses || statuses.includes(i.status))
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));

  return (
    <>
      <div className="page-head">
        <h1>Inspecțiile mele</h1>
        <Link to="/new" className="btn btn-primary">+ Inspecție nouă</Link>
      </div>
      <div className="tabs" role="tablist">
        {Object.entries(TABS).map(([key, t]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {t.label} ({inspections.filter((i) => !t.statuses || t.statuses.includes(i.status)).length})
          </button>
        ))}
      </div>
      {inspections.length === 0 && <p className="muted">Nu există încă inspecții pe acest dispozitiv. Conectează-te la internet pentru prima sincronizare.</p>}
      <ul className="list">
        {visible.map((i) => (
          <li key={i.id}>
            <Link to={`/inspections/${i.id}`} className="card list-item" data-testid="inspection-card">
              <div>
                <strong>{i.site?.name ?? 'Locație'}</strong>
                <div className="muted">{i.template?.title}</div>
              </div>
              <div className="list-meta">
                <StatusBadge status={i.status} pending={i.pendingStatus} />
                <span className="muted small">Termen: {formatDate(i.dueDate)}</span>
                {i.dirty && !i.conflict && <span className="chip chip-warn">nesincronizat</span>}
                {i.conflict && <span className="chip chip-error">conflict</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
