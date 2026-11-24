import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { Loading, ErrorBox } from '../../components/Feedback.jsx';
import { STATUS_LABELS, formatDate, formatDateTime } from '../../lib/labels.js';

const SORTS = { dueDate: 'Termen ↑', '-dueDate': 'Termen ↓', '-updatedAt': 'Actualizate recent', updatedAt: 'Actualizate demult' };

// Lista coordonatorului: filtrare, ordonare și paginare făcute pe server.
export function InspectionList() {
  const [params, setParams] = useSearchParams();
  const filters = {
    status: params.get('status') ?? '',
    siteId: params.get('siteId') ?? '',
    inspectorId: params.get('inspectorId') ?? '',
    sort: params.get('sort') ?? 'dueDate',
    page: Number(params.get('page') ?? 1),
  };
  const query = new URLSearchParams(Object.entries({ ...filters, pageSize: 10 }).filter(([, v]) => v !== '')).toString();

  const list = useApi(() => api.get(`/inspections?${query}`), [query]);
  const ref = useApi(async () => {
    const [sites, users] = await Promise.all([api.get('/sites'), api.get('/users')]);
    return { sites: sites.items, users: users.items };
  });

  function update(key, value) {
    const next = { ...filters, [key]: value, page: key === 'page' ? value : 1 };
    setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== '' && !(k === 'page' && v === 1))));
  }

  return (
    <>
      <h1>Inspecții</h1>
      <div className="card filters">
        <label>Stare
          <select value={filters.status} onChange={(e) => update('status', e.target.value)}>
            <option value="">Toate</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Locație
          <select value={filters.siteId} onChange={(e) => update('siteId', e.target.value)}>
            <option value="">Toate</option>
            {ref.data?.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>Inspector
          <select value={filters.inspectorId} onChange={(e) => update('inspectorId', e.target.value)}>
            <option value="">Toți</option>
            {ref.data?.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label>Ordonare
          <select value={filters.sort} onChange={(e) => update('sort', e.target.value)}>
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>

      <ErrorBox error={list.error} onRetry={list.reload} />
      {list.loading && !list.data && <Loading />}
      {list.data && (
        <>
          <p className="muted">{list.data.total} inspecții găsite</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Locație</th><th>Tip</th><th>Inspector</th><th>Termen</th><th>Stare</th><th>Actualizată</th></tr>
              </thead>
              <tbody>
                {list.data.items.map((i) => (
                  <tr key={i.id}>
                    <td><Link to={`/inspections/${i.id}`}>{i.site?.name}</Link></td>
                    <td>{i.template?.title}</td>
                    <td>{i.inspector?.name}</td>
                    <td>{formatDate(i.dueDate)}</td>
                    <td><StatusBadge status={i.status} /></td>
                    <td className="muted small">{formatDateTime(i.updatedAt)}</td>
                  </tr>
                ))}
                {list.data.items.length === 0 && <tr><td colSpan={6} className="muted">Nicio inspecție pentru filtrele alese.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination page={list.data.page} totalPages={list.data.totalPages} onChange={(p) => update('page', p)} />
        </>
      )}
    </>
  );
}
