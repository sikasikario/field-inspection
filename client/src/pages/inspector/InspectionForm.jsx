import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { syncEngine } from '../../lib/syncEngine.js';
import { useLocalData } from '../../hooks/useSync.js';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { Loading } from '../../components/Feedback.jsx';
import { EDITABLE, STATUS_LABELS, formatDate } from '../../lib/labels.js';

const SAVE_DELAY_MS = 500;

function isAnswered(v) {
  return v !== undefined && v !== null && v !== '';
}

// Formularul de inspecție. Fiecare răspuns se salvează local imediat (după o scurtă pauză la tastare);
// trimiterea la server o face motorul de sincronizare, când există rețea.
export function InspectionForm() {
  const { id } = useParams();
  const data = useLocalData(async () => {
    const inspection = await syncEngine.getInspection(id);
    const templates = (await syncEngine.getMeta('templates')) ?? [];
    return { inspection, template: templates.find((t) => t.id === inspection?.templateId) };
  }, [id]);

  const [edits, setEdits] = useState({}); // modificări încă nesalvate local
  const [fieldErrors, setFieldErrors] = useState({});
  const [comment, setComment] = useState('');
  const pending = useRef({});
  const timer = useRef(null);

  function flush() {
    clearTimeout(timer.current);
    const answers = Object.entries(pending.current).map(([itemId, value]) => ({ itemId: Number(itemId), value }));
    pending.current = {};
    if (answers.length) syncEngine.saveAnswers(id, answers);
  }

  // La părăsirea paginii, salvăm ce a rămas.
  useEffect(() => () => flush(), [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Odată ce valoarea a ajuns în baza locală, renunțăm la copia temporară.
  useEffect(() => {
    if (!data?.inspection) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(prev)) {
        if (!(k in pending.current) && (data.inspection.answers[k] ?? null) === v) delete next[k];
      }
      return next;
    });
  }, [data]);

  if (!data) return <Loading />;
  const { inspection, template } = data;
  if (!inspection) return <p>Inspecția nu există pe acest dispozitiv. <Link to="/">Înapoi</Link></p>;
  if (!template) return <Loading text="Șablonul se descarcă la prima sincronizare…" />;

  const value = (itemId) => (itemId in edits ? edits[itemId] : inspection.answers[itemId]);
  const editable = EDITABLE.includes(inspection.status) && !inspection.conflict;
  const missing = template.items.filter((it) => it.required && !isAnswered(value(it.id)));

  function change(item, raw) {
    let v = raw === '' ? null : raw;
    if (item.type === 'number' && v !== null) {
      const ok = /^-?\d+([.,]\d+)?$/.test(v.trim());
      setFieldErrors((e) => ({ ...e, [item.id]: ok ? null : 'Introdu un număr' }));
      setEdits((e) => ({ ...e, [item.id]: raw }));
      if (!ok) return;
      v = v.trim().replace(',', '.');
    } else {
      setFieldErrors((e) => ({ ...e, [item.id]: null }));
      setEdits((e) => ({ ...e, [item.id]: v }));
    }
    pending.current[item.id] = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, item.type === 'yes_no' ? 0 : SAVE_DELAY_MS);
  }

  async function transition(action) {
    flush();
    await syncEngine.requestTransition(id, action, comment.trim() || undefined);
    setComment('');
  }

  return (
    <article>
      <p><Link to="/">‹ Inspecțiile mele</Link></p>
      <div className="page-head">
        <div>
          <h1>{inspection.site?.name}</h1>
          <p className="muted">{inspection.template?.title} · termen {formatDate(inspection.dueDate)}</p>
        </div>
        <StatusBadge status={inspection.status} pending={inspection.pendingStatus} />
      </div>

      {inspection.conflict && <ConflictBanner inspection={inspection} template={template} />}
      {inspection.syncError && <div className="alert alert-error">Serverul a refuzat o modificare: {inspection.syncError}</div>}
      {inspection.dirty && !inspection.conflict && (
        <div className="alert alert-info">Modificările sunt salvate pe dispozitiv și se trimit automat când există conexiune.</div>
      )}
      {inspection.status === 'REJECTED' && (
        <div className="alert alert-warn">
          <strong>Respinsă de coordonator:</strong> {inspection.decisionComment}
          <div><button type="button" className="btn btn-small" onClick={() => transition('reopen')}>Redeschide pentru corectare</button></div>
        </div>
      )}
      {inspection.notes && <p className="card"><strong>Notițe:</strong> {inspection.notes}</p>}

      <form className="card checklist" onSubmit={(e) => e.preventDefault()}>
        {template.items.map((item) => (
          <fieldset key={item.id} className="question" disabled={!editable}>
            <legend>{item.position}. {item.label}{item.required && <span className="required" title="obligatoriu"> *</span>}</legend>
            {item.type === 'yes_no' && (
              <div className="yesno">
                {['da', 'nu'].map((opt) => (
                  <label key={opt} className={`choice ${value(item.id) === opt ? 'selected' : ''}`}>
                    <input type="radio" name={`q${item.id}`} value={opt} checked={value(item.id) === opt} onChange={() => change(item, opt)} />
                    {opt === 'da' ? 'Da' : 'Nu'}
                  </label>
                ))}
              </div>
            )}
            {item.type === 'number' && (
              <input type="text" inputMode="decimal" aria-label={item.label} value={value(item.id) ?? ''} onChange={(e) => change(item, e.target.value)} onBlur={flush} />
            )}
            {item.type === 'text' && (
              <textarea aria-label={item.label} maxLength={2000} value={value(item.id) ?? ''} onChange={(e) => change(item, e.target.value)} onBlur={flush} />
            )}
            {fieldErrors[item.id] && <p className="field-error">{fieldErrors[item.id]}</p>}
          </fieldset>
        ))}
      </form>

      {editable && (
        <div className="actions">
          {missing.length > 0 && <p className="muted">Mai sunt {missing.length} întrebări obligatorii fără răspuns.</p>}
          <button type="button" className="btn btn-primary" disabled={missing.length > 0 || Object.values(fieldErrors).some(Boolean)} onClick={() => transition('submit')}>
            Trimite spre verificare
          </button>
        </div>
      )}
    </article>
  );
}

function ConflictBanner({ inspection, template }) {
  const { conflict } = inspection;
  const server = conflict.server;
  const serverAnswers = Object.fromEntries((server.answers ?? []).map((a) => [a.itemId, a.value]));
  const differences = template.items.filter((it) => (inspection.answers[it.id] ?? null) !== (serverAnswers[it.id] ?? null));
  const canKeepMine = EDITABLE.includes(server.status);

  return (
    <div className="alert alert-error conflict" data-testid="conflict">
      <strong>Conflict la sincronizare.</strong>{' '}
      {conflict.code === 'NOT_EDITABLE'
        ? `Între timp, inspecția a devenit „${STATUS_LABELS[server.status]}” pe server și nu mai poate fi modificată. Varianta serverului are prioritate.`
        : 'Inspecția a fost modificată în altă parte după ce ai descărcat-o.'}
      {differences.length > 0 && (
        <table className="table">
          <thead><tr><th>Întrebare</th><th>Varianta ta</th><th>Pe server</th></tr></thead>
          <tbody>
            {differences.map((it) => (
              <tr key={it.id}><td>{it.label}</td><td>{inspection.answers[it.id] ?? '—'}</td><td>{serverAnswers[it.id] ?? '—'}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="btn-row">
        {canKeepMine && <button type="button" className="btn btn-small" onClick={() => syncEngine.resolveConflict(inspection.id, 'mine')}>Păstrează varianta mea</button>}
        <button type="button" className="btn btn-small" onClick={() => syncEngine.resolveConflict(inspection.id, 'server')}>Folosește varianta serverului</button>
      </div>
    </div>
  );
}
