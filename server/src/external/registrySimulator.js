// Simulator local al registrului extern de inspecții (cost zero, comportament controlabil).
// Defectele sunt programate explicit, într-o coadă: testele sunt deterministe, nu aleatoare.
//
// Tipuri de defect pentru următoarele cereri:
//   ok           răspuns normal
//   error        HTTP 500, cererea NU e înregistrată
//   rateLimit    HTTP 429 cu Retry-After, cererea NU e înregistrată
//   badRequest   HTTP 400 (eroare permanentă)
//   timeout      nu răspunde în timp util, cererea NU e înregistrată
//   lostResponse cererea ESTE înregistrată, dar răspunsul vine prea târziu (clientul vede timeout)
//                → la retry, registrul recunoaște cheia și întoarce același rezultat (răspuns duplicat)
import express from 'express';

export const FAULTS = ['ok', 'error', 'rateLimit', 'badRequest', 'timeout', 'lostResponse'];

export function createRegistrySimulator({ hangMs = 10000, retryAfterSeconds = 2 } = {}) {
  const records = new Map(); // Idempotency-Key -> înregistrare
  let faults = [];
  let requests = 0;
  const timers = new Set();

  const later = (fn) => {
    const t = setTimeout(() => { timers.delete(t); fn(); }, hangMs);
    timers.add(t);
  };

  const app = express();
  app.use(express.json());

  app.post('/registry/inspections', (req, res) => {
    requests += 1;
    const key = req.get('Idempotency-Key');
    if (!key) return res.status(400).json({ error: 'Lipsește header-ul Idempotency-Key' });

    const fault = faults.shift() ?? 'ok';
    if (fault === 'error') return res.status(500).json({ error: 'Eroare simulată' });
    if (fault === 'rateLimit') return res.status(429).set('Retry-After', String(retryAfterSeconds)).json({ error: 'Prea multe cereri' });
    if (fault === 'badRequest') return res.status(400).json({ error: 'Cerere respinsă (simulat)' });
    if (fault === 'timeout') return later(() => { if (!res.headersSent) res.status(504).end(); });

    let record = records.get(key);
    const replayed = Boolean(record);
    if (!record) {
      record = { registryId: `REG-${String(records.size + 1).padStart(5, '0')}`, key, inspectionId: req.body?.inspectionId, receivedAt: new Date().toISOString() };
      records.set(key, record);
    }
    const reply = () => {
      if (!res.headersSent) res.status(replayed ? 200 : 201).json({ registryId: record.registryId, replayed });
    };
    if (fault === 'lostResponse') return later(reply);
    return reply();
  });

  // Rute de control (doar pentru teste și demonstrație)
  app.post('/__control/faults', (req, res) => {
    const list = req.body?.faults;
    if (!Array.isArray(list) || !list.every((f) => FAULTS.includes(f))) {
      return res.status(400).json({ error: `faults trebuie să fie o listă din: ${FAULTS.join(', ')}` });
    }
    faults = [...list];
    res.json({ pendingFaults: faults });
  });
  app.post('/__control/reset', (req, res) => {
    records.clear(); faults = []; requests = 0;
    res.json({ ok: true });
  });
  app.get('/__control/state', (req, res) => {
    res.json({ requests, pendingFaults: faults, records: [...records.values()] });
  });

  return {
    app,
    setFaults: (list) => { faults = [...list]; },
    reset: () => { records.clear(); faults = []; requests = 0; },
    state: () => ({ requests, pendingFaults: [...faults], records: [...records.values()] }),
    clearTimers: () => { timers.forEach(clearTimeout); timers.clear(); },
  };
}
