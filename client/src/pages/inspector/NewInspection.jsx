import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { syncEngine } from '../../lib/syncEngine.js';
import { useLocalData } from '../../hooks/useSync.js';
import { Loading } from '../../components/Feedback.jsx';

// Inspecție neplanificată: se creează local (merge și offline) și se trimite la sincronizare.
export function NewInspection() {
  const navigate = useNavigate();
  const ref = useLocalData(async () => ({ sites: (await syncEngine.getMeta('sites')) ?? [], templates: (await syncEngine.getMeta('templates')) ?? [] }));
  const [form, setForm] = useState({ siteId: '', templateId: '', notes: '' });

  if (!ref) return <Loading />;
  if (!ref.sites.length) return <p className="muted">Locațiile și șabloanele se descarcă la prima sincronizare. Conectează-te la internet o dată.</p>;

  async function onSubmit(e) {
    e.preventDefault();
    const id = await syncEngine.createInspection({ siteId: Number(form.siteId), templateId: Number(form.templateId), notes: form.notes.trim() });
    navigate(`/inspections/${id}`);
  }

  return (
    <form className="card form narrow-form" onSubmit={onSubmit}>
      <h1>Inspecție neplanificată</h1>
      <label>Locație
        <select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })} required>
          <option value="">Alege…</option>
          {ref.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label>Tip de inspecție
        <select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })} required>
          <option value="">Alege…</option>
          {ref.templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </label>
      <label>Notițe (opțional)
        <textarea value={form.notes} maxLength={2000} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </label>
      <button type="submit" className="btn btn-primary">Creează și începe</button>
    </form>
  );
}
