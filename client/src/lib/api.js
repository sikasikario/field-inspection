// Wrapper peste fetch: token, timeout, format unic de eroare și simulatorul de rețea.
import { netSim } from './netSim.js';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message ?? `Eroare HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}

/** Serverul nu a putut fi contactat (fără rețea, timeout, răspuns pierdut). */
export class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetworkError';
  }
}

let token = null;
export const setToken = (t) => { token = t; };

const TIMEOUT_MS = 10000;

async function send(method, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    throw new NetworkError(err.name === 'AbortError' ? 'Serverul nu a răspuns la timp' : 'Serverul nu poate fi contactat');
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (path) => send('GET', path),
  post: (path, body) => send('POST', path, body ?? {}),
  /** Cererile de sincronizare trec prin simulatorul de rețea. */
  sync: (operations) => netSim.run(
    `Sincronizare (${operations.map((o) => o.type).join(', ')})`,
    () => send('POST', '/sync', { operations }),
    NetworkError,
  ),
};
