// Pachetul EXT: teste deterministe cu simulatorul registrului extern.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { api, resetDb, asUsers, findInspection } from './helpers.js';
import { createRegistrySimulator } from '../src/external/registrySimulator.js';
import { processDueDeliveries, computeBackoff } from '../src/services/deliveryService.js';
import { ExternalDelivery } from '../src/models/index.js';

const HANG_MS = 300; // cât „atârnă” simulatorul la timeout
const settings = { timeoutMs: 100, maxAttempts: 4, baseDelayMs: 1000, maxDelayMs: 8000 };
const noJitter = () => 1; // backoff fără aleatoriu în teste: exact intervalul exponențial

let sim;
let server;
let registryUrl;
let u;

beforeAll(async () => {
  sim = createRegistrySimulator({ hangMs: HANG_MS, retryAfterSeconds: 7 });
  server = sim.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  registryUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  sim.clearTimers();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

beforeEach(async () => {
  await resetDb();
  sim.reset();
  u = await asUsers();
});

/** Aprobă o inspecție trimisă → apare o livrare PENDING. */
async function approveOne() {
  const insp = await findInspection({ status: 'SUBMITTED' });
  await api().post(`/api/inspections/${insp.id}/transitions`).set(u.coord.auth).send({ action: 'approve', baseVersion: insp.version });
  return ExternalDelivery.findOne({ where: { inspectionId: insp.id } });
}

/** Rulează worker-ul la momentul următoarei încercări programate (timp simulat). */
async function runAt(time) {
  return processDueDeliveries({ now: time, settings, registryUrl, random: noJitter });
}
async function runNext(deliveryId) {
  const d = await ExternalDelivery.findByPk(deliveryId);
  return runAt(d.nextAttemptAt ?? new Date());
}

describe('livrarea către registrul extern', () => {
  it('caz normal: livrată din prima, cu referința registrului', async () => {
    const d = await approveOne();
    await runAt(new Date());
    await d.reload();
    expect(d).toMatchObject({ state: 'SENT', attempts: 1, externalRef: 'REG-00001' });
    expect(sim.state().records[0].inspectionId).toBe(d.inspectionId);
  });

  it('timeout → retry cu backoff → succes', async () => {
    sim.setFaults(['timeout', 'ok']);
    const d = await approveOne();
    const start = new Date();
    await runAt(start);
    await d.reload();
    expect(d.state).toBe('PENDING');
    expect(d.lastError).toMatch(/timeout/);
    expect(d.nextAttemptAt.getTime() - start.getTime()).toBe(1000); // backoff pentru încercarea 1
    await runNext(d.id);
    await d.reload();
    expect(d).toMatchObject({ state: 'SENT', attempts: 2 });
    expect(sim.state().records).toHaveLength(1);
  });

  it('erori 500 repetate: intervalele cresc exponențial, apoi succes', async () => {
    sim.setFaults(['error', 'error', 'error', 'ok']);
    const d = await approveOne();
    const delays = [];
    let now = new Date();
    for (let i = 0; i < 3; i++) {
      await runAt(now);
      await d.reload();
      delays.push(d.nextAttemptAt.getTime() - now.getTime());
      now = d.nextAttemptAt;
    }
    expect(delays).toEqual([1000, 2000, 4000]);
    await runAt(now);
    await d.reload();
    expect(d).toMatchObject({ state: 'SENT', attempts: 4 });
  });

  it('429: se respectă Retry-After de la registru', async () => {
    sim.setFaults(['rateLimit', 'ok']);
    const d = await approveOne();
    const start = new Date();
    await runAt(start);
    await d.reload();
    expect(d.nextAttemptAt.getTime() - start.getTime()).toBe(7000);
    expect(d.lastError).toMatch(/429/);
  });

  it('retry limitat: după maxAttempts eșecuri devine FAILED, fără buclă infinită', async () => {
    sim.setFaults(['error', 'error', 'error', 'error', 'ok']);
    const d = await approveOne();
    for (let i = 0; i < 6; i++) await runNext(d.id);
    await d.reload();
    expect(d).toMatchObject({ state: 'FAILED', attempts: 4 });
    expect(sim.state().requests).toBe(4);
  });

  it('eroare permanentă (400): FAILED imediat, fără reîncercări', async () => {
    sim.setFaults(['badRequest']);
    const d = await approveOne();
    await runAt(new Date());
    await d.reload();
    expect(d).toMatchObject({ state: 'FAILED', attempts: 1 });
  });

  it('răspuns pierdut + retry: registrul răspunde duplicat, dar are o singură înregistrare', async () => {
    sim.setFaults(['lostResponse', 'ok']);
    const d = await approveOne();
    await runAt(new Date());
    await d.reload();
    expect(d.state).toBe('PENDING'); // noi am văzut timeout…
    expect(sim.state().records).toHaveLength(1); // …dar registrul a primit cererea
    await runNext(d.id);
    await d.reload();
    expect(d).toMatchObject({ state: 'SENT', externalRef: 'REG-00001' });
    expect(sim.state().records).toHaveLength(1); // fără duplicat datorită cheii de idempotență
    expect(sim.state().requests).toBe(2);
  });

  it('registrul indisponibil (rețea) → eșec temporar, reîncercare programată', async () => {
    const d = await approveOne();
    await processDueDeliveries({ now: new Date(), settings, registryUrl: 'http://127.0.0.1:1', random: noJitter });
    await d.reload();
    expect(d.state).toBe('PENDING');
    expect(d.lastError).toMatch(/rețea/);
  });

  it('coordonatorul vede livrările și reia manual una eșuată, cu aceeași cheie', async () => {
    sim.setFaults(['badRequest', 'ok']);
    const d = await approveOne();
    await runAt(new Date());
    const list = await api().get('/api/deliveries').set(u.coord.auth);
    expect(list.body.items[0]).toMatchObject({ id: d.id, state: 'FAILED' });

    const retry = await api().post(`/api/deliveries/${d.id}/retry`).set(u.coord.auth);
    expect(retry.body.state).toBe('PENDING');
    expect((await api().post(`/api/deliveries/${d.id}/retry`).set(u.coord.auth)).status).toBe(409);
    expect((await api().post('/api/deliveries/999/retry').set(u.coord.auth)).status).toBe(404);

    const keyBefore = (await ExternalDelivery.findByPk(d.id)).idempotencyKey;
    await runAt(new Date());
    await d.reload();
    expect(d.state).toBe('SENT');
    expect(d.idempotencyKey).toBe(keyBefore);
  });

  it('livrările nescadente nu sunt trimise înainte de timp', async () => {
    sim.setFaults(['error']);
    const d = await approveOne();
    const start = new Date();
    await runAt(start);
    const results = await runAt(new Date(start.getTime() + 500)); // înainte de backoff (1000 ms)
    expect(results).toHaveLength(0);
    expect(sim.state().requests).toBe(1);
    await d.reload();
    expect(d.attempts).toBe(1);
  });
});

describe('simulatorul: rute de control', () => {
  it('configurare defecte, stare, reset și validare', async () => {
    const res = await fetch(`${registryUrl}/__control/faults`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ faults: ['error', 'ok'] }) });
    expect((await res.json()).pendingFaults).toEqual(['error', 'ok']);
    const bad = await fetch(`${registryUrl}/__control/faults`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ faults: ['explozie'] }) });
    expect(bad.status).toBe(400);
    const noKey = await fetch(`${registryUrl}/registry/inspections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(noKey.status).toBe(400);
    await fetch(`${registryUrl}/__control/reset`, { method: 'POST' });
    const state = await (await fetch(`${registryUrl}/__control/state`)).json();
    expect(state).toEqual({ requests: 0, pendingFaults: [], records: [] });
  });
});

describe('backoff (unitar)', () => {
  it('crește exponențial, e plafonat și are jitter între 50% și 100%', () => {
    const s = { baseDelayMs: 1000, maxDelayMs: 8000 };
    expect([1, 2, 3, 4, 5, 6].map((a) => computeBackoff(a, s, () => 1))).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
    expect(computeBackoff(3, s, () => 0)).toBe(2000);
    const r = computeBackoff(3, s);
    expect(r).toBeGreaterThanOrEqual(2000);
    expect(r).toBeLessThanOrEqual(4000);
  });
});
