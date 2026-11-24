import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { Loading, ErrorBox } from '../../components/Feedback.jsx';

const empty = { inspectorId: '', siteId: '', templateId: '', dueDate: '', notes: '' };

export function Assign() {
  const ref = useApi(async () => {
    const [users, sites, templates] = await Promise.all([api.get('/users'), api.get('/sites'), api.get('/templates')]);
    return { users: users.items, sites: sites.items, templates: templates.items };
  });
  const [form, setForm] = useState(empty);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (ref.loading) return <Loading />;
  if (ref.error) return <ErrorBox error={ref.error} onRetry={ref.reload} />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.post('/inspections', {
        id: crypto.randomUUID(),
        inspectorId: Number(form.inspectorId),
        siteId: Number(form.siteId),
        templateId: Number(form.templateId),
        dueDate: form.dueDate || undefined,
        notes: form.notes.trim() || undefined,
      });
      setResult(created);
      setForm(empty);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form narrow-form" onSubmit={onSubmit}>
      <h1>Asignare inspecție</h1>
      <label>Inspector
        <select value={form.inspectorId} onChange={set('inspectorId')} required>
          <option value="">Alege…</option>
          {ref.data.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </label>
      <label>Locație
        <select value={form.siteId} onChange={set('siteId')} required>
          <option value="">Alege…</option>
          {ref.data.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label>Tip de inspecție
        <select value={form.templateId} onChange={set('templateId')} required>
          <option value="">Alege…</option>
          {ref.data.templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </label>
      <label>Termen
        <input type="date" value={form.dueDate} onChange={set('dueDate')} />
      </label>
      <label>Instrucțiuni (opțional)
        <textarea value={form.notes} maxLength={2000} onChange={set('notes')} />
      </label>
      <ErrorBox error={error} />
      {result && <div className="alert alert-info">Inspecția a fost asignată lui {result.inspector?.name}. <Link to={`/inspections/${result.id}`}>Vezi detalii</Link></div>}
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Se salvează…' : 'Asignează'}</button>
    </form>
  );
}
