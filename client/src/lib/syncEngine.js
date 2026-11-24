// Motorul de sincronizare al inspectorului (pachetul OFF).
//
// Principiul: interfața citește și scrie DOAR în baza locală (IndexedDB), deci merge la fel
// online și offline. Fiecare modificare devine o operație în coada `outbox`, cu un opId unic.
// Când există rețea, coada e trimisă la server, în ordine. Dacă o trimitere eșuează din cauza
// rețelei, operația rămâne în coadă (cu același opId) și e retrimisă mai târziu; serverul
// recunoaște opId-ul, deci nu apar duplicate.
import { openUserDb } from './db.js';
import { api, ApiError } from './api.js';
import { EDITABLE } from './labels.js';

const PREDICTED_STATUS = { start: 'IN_PROGRESS', submit: 'SUBMITTED', reopen: 'IN_PROGRESS' };
const CONFLICT_CODES = ['VERSION_CONFLICT', 'NOT_EDITABLE'];
const SYNC_INTERVAL_MS = 15000;
const MAX_RETRY_DELAY_MS = 30000;

const emptyDraft = () => ({ answers: {}, status: null });

/** Ce vede interfața: copia de pe server peste care se aplică modificările locale. */
export function toView(record) {
  const { data, draft } = record;
  const answers = Object.fromEntries((data.answers ?? []).map((a) => [a.itemId, a.value]));
  for (const [itemId, value] of Object.entries(draft.answers)) {
    if (value === null) delete answers[itemId];
    else answers[itemId] = value;
  }
  const hasDraftAnswers = Object.keys(draft.answers).length > 0;
  let status = draft.status ?? data.status;
  // Serverul mută automat ASSIGNED → IN_PROGRESS la primul răspuns; afișăm același lucru local.
  if (status === 'ASSIGNED' && hasDraftAnswers) status = 'IN_PROGRESS';
  return {
    ...data,
    answers,
    status,
    pendingStatus: Boolean(draft.status),
    dirty: hasDraftAnswers || Boolean(draft.status) || record.localOnly,
    localOnly: record.localOnly,
    conflict: record.conflict,
    syncError: record.syncError,
  };
}

class SyncEngine {
  constructor() {
    this.db = null;
    this.listeners = new Set();
    this.state = { ready: false, pending: 0, syncing: false, lastSync: null, lastError: null, needsLogin: false };
    this.retryDelay = 0;
    this.retryTimer = null;
    this.intervalTimer = null;
    this.running = null;
    this.onOnline = () => this.sync();
  }

  // ---------- ciclu de viață ----------
  async start(user) {
    if (this.user?.id === user.id && this.db) return;
    this.stop();
    this.user = user;
    this.db = await openUserDb(user.id);
    this.state = { ...this.state, ready: true, needsLogin: false, lastSync: await this.db.get('meta', 'lastSync') ?? null };
    await this.refreshPending();
    window.addEventListener('online', this.onOnline);
    this.intervalTimer = setInterval(() => this.sync(), SYNC_INTERVAL_MS);
    this.sync();
  }

  stop() {
    window.removeEventListener('online', this.onOnline);
    clearInterval(this.intervalTimer);
    clearTimeout(this.retryTimer);
    this.db?.close();
    this.db = null;
    this.user = null;
    this.state = { ready: false, pending: 0, syncing: false, lastSync: null, lastError: null, needsLogin: false };
    this.emit();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  emit(patch = {}) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn(this.state));
  }

  async refreshPending() {
    this.emit({ pending: await this.db.count('outbox') });
  }

  // ---------- citire ----------
  async listInspections() {
    return (await this.db.getAll('inspections')).map(toView);
  }

  async getInspection(id) {
    const record = await this.db.get('inspections', id);
    return record ? toView(record) : null;
  }

  async getMeta(key) {
    return this.db.get('meta', key);
  }

  // ---------- modificări locale (merg și offline) ----------
  async saveAnswers(inspectionId, answers) {
    const tx = this.db.transaction(['inspections', 'outbox'], 'readwrite');
    const record = await tx.objectStore('inspections').get(inspectionId);
    for (const { itemId, value } of answers) record.draft.answers[itemId] = value;
    record.syncError = null;
    await tx.objectStore('inspections').put(record);

    // Dacă ultima operație din coadă pentru această inspecție e o salvare încă netrimisă,
    // o completăm în loc să adăugăm una nouă (mai puține cereri, aceeași ordine).
    const ops = await tx.objectStore('outbox').index('byInspection').getAll(inspectionId);
    const last = ops.at(-1);
    if (last && last.type === 'saveAnswers' && !last.frozen) {
      const merged = new Map(last.payload.answers.map((a) => [a.itemId, a]));
      for (const a of answers) merged.set(a.itemId, a);
      last.payload.answers = [...merged.values()];
      await tx.objectStore('outbox').put(last);
    } else {
      await tx.objectStore('outbox').add(this.newOp('saveAnswers', inspectionId, { answers }));
    }
    await tx.done;
    await this.afterLocalChange();
  }

  async requestTransition(inspectionId, action, comment) {
    const tx = this.db.transaction(['inspections', 'outbox'], 'readwrite');
    const record = await tx.objectStore('inspections').get(inspectionId);
    record.draft.status = PREDICTED_STATUS[action] ?? record.draft.status;
    record.syncError = null;
    await tx.objectStore('inspections').put(record);
    await tx.objectStore('outbox').add(this.newOp('transition', inspectionId, { action, ...(comment ? { comment } : {}) }));
    await tx.done;
    await this.afterLocalChange();
  }

  /** Inspecție neplanificată, creată pe dispozitiv. ID-ul (UUID) e generat aici și rămâne definitiv. */
  async createInspection({ siteId, templateId, notes }) {
    const id = crypto.randomUUID();
    const sites = (await this.getMeta('sites')) ?? [];
    const templates = (await this.getMeta('templates')) ?? [];
    const site = sites.find((s) => s.id === siteId);
    const template = templates.find((t) => t.id === templateId);
    const now = new Date().toISOString();
    const record = {
      id,
      data: {
        id, status: 'IN_PROGRESS', version: 0, templateId, siteId, inspectorId: this.user.id,
        notes: notes || null, dueDate: null, createdAt: now, updatedAt: now, answers: [],
        site: site && { id: site.id, name: site.name },
        template: template && { id: template.id, title: template.title },
      },
      draft: emptyDraft(),
      localOnly: true,
      conflict: null,
      syncError: null,
    };
    const tx = this.db.transaction(['inspections', 'outbox'], 'readwrite');
    await tx.objectStore('inspections').add(record);
    await tx.objectStore('outbox').add(this.newOp('create', id, { siteId, templateId, ...(notes ? { notes } : {}) }));
    await tx.done;
    await this.afterLocalChange();
    return id;
  }

  /**
   * Rezolvarea unui conflict:
   *  - 'server': renunțăm la modificările locale și păstrăm varianta de pe server;
   *  - 'mine': pornim de la varianta serverului și retrimitem modificările locale peste ea
   *            (posibil doar dacă inspecția mai e editabilă pe server).
   */
  async resolveConflict(inspectionId, choice) {
    const record = await this.db.get('inspections', inspectionId);
    if (!record?.conflict) return;
    const { server } = record.conflict;
    const pendingAnswers = Object.entries(record.draft.answers).map(([itemId, value]) => ({ itemId: Number(itemId), value }));
    const pendingSubmit = record.draft.status === 'SUBMITTED';

    record.data = server;
    record.conflict = null;
    record.syncError = null;
    record.draft = emptyDraft();
    await this.db.put('inspections', record);

    if (choice === 'mine' && EDITABLE.includes(server.status)) {
      if (pendingAnswers.length) await this.saveAnswers(inspectionId, pendingAnswers);
      if (pendingSubmit) await this.requestTransition(inspectionId, 'submit');
    }
    await this.afterLocalChange();
  }

  newOp(type, inspectionId, payload) {
    return { opId: crypto.randomUUID(), type, inspectionId, payload, frozen: false, attempts: 0, createdAt: new Date().toISOString() };
  }

  async afterLocalChange() {
    await this.refreshPending();
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.sync(), 300);
  }

  // ---------- sincronizare ----------
  /** Trimite coada, apoi descarcă modificările. O singură rulare odată. */
  sync() {
    if (!this.db || this.state.needsLogin) return Promise.resolve();
    if (this.running) return this.running;
    this.running = (async () => {
      this.emit({ syncing: true });
      try {
        const flushed = await this.flush();
        if (flushed) await this.pull();
        this.retryDelay = 0;
        this.emit({ lastError: null });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          this.emit({ needsLogin: true, lastError: 'Sesiunea a expirat. Autentifică-te din nou; modificările rămân salvate pe dispozitiv.' });
        } else {
          this.emit({ lastError: err.message });
          this.scheduleRetry();
        }
      } finally {
        this.running = null;
        if (this.db) await this.refreshPending();
        this.emit({ syncing: false });
      }
    })();
    return this.running;
  }

  scheduleRetry() {
    // Backoff exponențial: 2 s, 4 s, 8 s … maximum 30 s.
    this.retryDelay = Math.min(MAX_RETRY_DELAY_MS, this.retryDelay ? this.retryDelay * 2 : 2000);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.sync(), this.retryDelay);
  }

  /** Trimite operațiile din coadă una câte una, în ordine. Aruncă eroare la probleme de rețea. */
  async flush() {
    for (;;) {
      const cursor = await this.db.transaction('outbox').store.openCursor();
      if (!cursor) return true;
      const op = cursor.value;
      const record = await this.db.get('inspections', op.inspectionId);

      if (!op.frozen) {
        // Versiunea de bază se fixează la PRIMA trimitere și nu se mai schimbă: o retrimitere
        // trebuie să fie identică, ca serverul să o recunoască după opId.
        if (op.type !== 'create') op.payload.baseVersion = record.data.version;
        op.frozen = true;
        await this.db.put('outbox', op);
      }

      let result;
      try {
        [result] = (await api.sync([{ opId: op.opId, type: op.type, inspectionId: op.inspectionId, payload: op.payload }])).results;
      } catch (err) {
        op.attempts += 1;
        op.lastError = err.message;
        await this.db.put('outbox', op);
        throw err;
      }
      await this.applyResult(op, result);
      await this.refreshPending();
    }
  }

  async applyResult(op, result) {
    const tx = this.db.transaction(['inspections', 'outbox'], 'readwrite');
    const outbox = tx.objectStore('outbox');
    // Recitim înregistrarea: utilizatorul poate să fi făcut modificări cât timp cererea era pe drum.
    const record = await tx.objectStore('inspections').get(op.inspectionId);
    const code = result.body?.error?.code;

    if (result.status < 300) {
      record.data = result.body;
      record.localOnly = false;
      record.syncError = null;
      if (op.type === 'saveAnswers') {
        // Ștergem din draft doar ce a fost confirmat și nu s-a mai schimbat între timp.
        for (const a of op.payload.answers) {
          if (record.draft.answers[a.itemId] === a.value) delete record.draft.answers[a.itemId];
        }
      }
      if (op.type === 'transition') {
        const others = (await outbox.index('byInspection').getAll(op.inspectionId))
          .filter((o) => o.seq !== op.seq && o.type === 'transition');
        if (others.length === 0) record.draft.status = null;
      }
      await outbox.delete(op.seq);
    } else if (result.status === 409 && CONFLICT_CODES.includes(code)) {
      // Conflict: păstrăm modificările locale și varianta serverului; utilizatorul alege.
      // Operațiile rămase pentru această inspecție ar eșua la fel, deci le scoatem din coadă.
      record.conflict = { code, message: result.body.error.message, server: result.body.error.details.server };
      for (const o of await outbox.index('byInspection').getAll(op.inspectionId)) await outbox.delete(o.seq);
    } else {
      // Eroare definitivă (validare, permisiuni): o arătăm și renunțăm la operație.
      record.syncError = result.body?.error?.message ?? `Eroare ${result.status}`;
      if (op.type === 'transition') record.draft.status = null;
      await outbox.delete(op.seq);
    }
    await tx.objectStore('inspections').put(record);
    await tx.done;
    this.emit();
  }

  /** Descarcă inspecțiile modificate pe server de la ultima sincronizare + datele de referință. */
  async pull() {
    const lastSync = await this.db.get('meta', 'lastSync');
    const [changes, templates, sites] = await Promise.all([
      api.get(`/sync/pull${lastSync ? `?since=${encodeURIComponent(lastSync)}` : ''}`),
      api.get('/templates'),
      api.get('/sites'),
    ]);
    const tx = this.db.transaction(['inspections', 'outbox', 'meta'], 'readwrite');
    for (const inspection of changes.inspections) {
      const existing = await tx.objectStore('inspections').get(inspection.id);
      const pendingOps = await tx.objectStore('outbox').index('byInspection').count(inspection.id);
      // Nu suprascriem o inspecție cu modificări netrimise sau cu un conflict deschis:
      // răspunsul serverului la operația ei va aduce oricum varianta actuală.
      if (existing && (pendingOps > 0 || existing.conflict)) continue;
      await tx.objectStore('inspections').put({
        id: inspection.id,
        data: inspection,
        draft: existing?.draft ?? emptyDraft(),
        localOnly: false,
        conflict: null,
        syncError: existing?.syncError ?? null,
      });
    }
    await tx.objectStore('meta').put(templates.items, 'templates');
    await tx.objectStore('meta').put(sites.items, 'sites');
    await tx.objectStore('meta').put(changes.serverTime, 'lastSync');
    await tx.done;
    this.emit({ lastSync: changes.serverTime });
  }
}

export const syncEngine = new SyncEngine();
