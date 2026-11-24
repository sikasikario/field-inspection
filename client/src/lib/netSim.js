// Simulator de rețea pe client (pachetul EXT, scenariul din fișa temei).
// Se aplică doar cererilor de sincronizare. Defectele se programează într-o coadă:
// fiecare cerere de sincronizare consumă primul defect din coadă, deci comportamentul e previzibil.
//
//   offline       cererea nu pleacă deloc (ca în mod avion)
//   timeout       cererea nu primește răspuns în timp util și nu ajunge la server
//   lostResponse  cererea AJUNGE la server și e aplicată, dar răspunsul se pierde
//                 → clientul o retrimite → serverul recunoaște opId-ul și nu o aplică a doua oară
//   duplicate     aceeași cerere e trimisă de două ori (ca un retry automat al rețelei)
//   slow          răspunsul vine după 3 secunde

export const FAULTS = {
  offline: 'Fără rețea',
  timeout: 'Timeout',
  lostResponse: 'Răspuns pierdut',
  duplicate: 'Cerere duplicată',
  slow: 'Rețea lentă (3 s)',
};

const listeners = new Set();
const state = { queue: [], log: [] };

const emit = () => listeners.forEach((fn) => fn({ queue: [...state.queue], log: [...state.log] }));

export const netSim = {
  subscribe(fn) {
    listeners.add(fn);
    fn({ queue: [...state.queue], log: [...state.log] });
    return () => listeners.delete(fn);
  },
  enqueue(fault) {
    state.queue.push(fault);
    emit();
  },
  clear() {
    state.queue = [];
    state.log = [];
    emit();
  },
  record(message) {
    state.log = [{ at: new Date().toLocaleTimeString('ro-RO'), message }, ...state.log].slice(0, 12);
    emit();
  },

  /** Rulează o cerere prin simulator. `send` face cererea reală. */
  async run(label, send, NetworkError) {
    const fault = state.queue.shift();
    if (fault) emit();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    switch (fault) {
      case 'offline':
        this.record(`${label}: blocată (fără rețea), nu a ajuns la server`);
        throw new NetworkError('Simulat: fără rețea');
      case 'timeout':
        await sleep(1500);
        this.record(`${label}: timeout, nu a ajuns la server`);
        throw new NetworkError('Simulat: timeout');
      case 'lostResponse':
        await send();
        this.record(`${label}: a ajuns la server, dar răspunsul s-a pierdut`);
        throw new NetworkError('Simulat: răspuns pierdut');
      case 'duplicate': {
        const [first, second] = await Promise.allSettled([send(), send()]);
        this.record(`${label}: trimisă de 2 ori simultan`);
        const ok = [second, first].find((r) => r.status === 'fulfilled');
        if (ok) return ok.value;
        throw second.reason;
      }
      case 'slow':
        await sleep(3000);
        this.record(`${label}: răspuns întârziat 3 s`);
        return send();
      default:
        return send();
    }
  },
};
