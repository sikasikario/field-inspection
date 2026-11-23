// Pachetul EXT: livrarea inspecțiilor aprobate către registrul extern (model „outbox”).
// Aprobarea creează o livrare PENDING; worker-ul de aici o trimite, cu:
//   - timeout pe fiecare încercare,
//   - retry limitat (maxAttempts), cu backoff exponențial și jitter,
//   - respectarea Retry-After la 429,
//   - aceeași cheie de idempotență la fiecare încercare (registrul nu creează duplicate).
// Stări: PENDING → SENT, sau PENDING → FAILED (eșec permanent / încercări epuizate).
import { Op } from 'sequelize';
import { config } from '../config.js';
import { withWriteTransaction } from '../db.js';
import {
  ExternalDelivery, Inspection, Site, ChecklistTemplate, User, Answer, ChecklistItem,
} from '../models/index.js';
import { sendToRegistry } from '../external/registryClient.js';
import { notFound, conflict } from '../errors.js';
import { requirePositiveInt } from '../validation.js';

/** Backoff exponențial cu „equal jitter”: între jumătate și întregul intervalului exponențial. */
export function computeBackoff(attempt, { baseDelayMs, maxDelayMs }, random = Math.random) {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return Math.round(exp / 2 + (random() * exp) / 2);
}

async function buildPayload(inspectionId) {
  const i = await Inspection.findByPk(inspectionId, {
    include: [
      { model: Site, as: 'site' },
      { model: ChecklistTemplate, as: 'template' },
      { model: User, as: 'inspector' },
      { model: Answer, as: 'answers', include: [{ model: ChecklistItem, as: 'item' }] },
    ],
  });
  return {
    inspectionId: i.id,
    site: i.site.name,
    template: i.template.title,
    inspector: i.inspector.name,
    approvedAt: i.decidedAt,
    nonConformities: i.answers.filter((a) => a.item.type === 'yes_no' && a.value === 'nu').length,
  };
}

export async function processDueDeliveries({
  now = new Date(), settings = config.delivery, registryUrl = config.registryUrl, random = Math.random,
} = {}) {
  const due = await ExternalDelivery.findAll({
    where: { state: 'PENDING', nextAttemptAt: { [Op.lte]: now } },
    order: [['nextAttemptAt', 'ASC']],
    limit: 20,
  });

  const results = [];
  for (const delivery of due) {
    const payload = await buildPayload(delivery.inspectionId);
    const r = await sendToRegistry({
      registryUrl, idempotencyKey: delivery.idempotencyKey, payload, timeoutMs: settings.timeoutMs,
    });
    const attempts = delivery.attempts + 1;
    let patch;
    if (r.ok) {
      patch = { state: 'SENT', attempts, externalRef: r.registryId, lastError: null, nextAttemptAt: null };
    } else if (!r.retryable || attempts >= settings.maxAttempts) {
      patch = { state: 'FAILED', attempts, lastError: r.error, nextAttemptAt: null };
    } else {
      const delay = r.retryAfterMs ?? computeBackoff(attempts, settings, random);
      patch = { attempts, lastError: r.error, nextAttemptAt: new Date(now.getTime() + delay) };
    }
    await withWriteTransaction((transaction) => delivery.update(patch, { transaction }));
    results.push({ id: delivery.id, ...patch });
  }
  return results;
}

/** Pornește worker-ul în proces. Livrările PENDING sunt în baza de date, deci supraviețuiesc unui restart. */
export function startDeliveryWorker({ intervalMs = config.delivery.pollIntervalMs } = {}) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return; // o singură rundă odată
    running = true;
    try {
      await processDueDeliveries();
    } catch (err) {
      console.error('Eroare în worker-ul de livrare:', err.message);
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

export async function listDeliveries() {
  const rows = await ExternalDelivery.findAll({ order: [['updatedAt', 'DESC']] });
  return rows.map((d) => ({
    id: d.id,
    inspectionId: d.inspectionId,
    state: d.state,
    attempts: d.attempts,
    lastError: d.lastError,
    externalRef: d.externalRef,
    nextAttemptAt: d.nextAttemptAt,
    updatedAt: d.updatedAt,
  }));
}

/** Reluare manuală a unei livrări eșuate. Păstrăm aceeași cheie de idempotență. */
export async function retryDelivery(id) {
  const deliveryId = requirePositiveInt(id, 'id');
  return withWriteTransaction(async (transaction) => {
    const d = await ExternalDelivery.findByPk(deliveryId, { transaction });
    if (!d) throw notFound('Livrarea nu există');
    if (d.state !== 'FAILED') throw conflict('INVALID_STATE', 'Doar livrările FAILED pot fi reluate');
    await d.update({ state: 'PENDING', attempts: 0, nextAttemptAt: new Date() }, { transaction });
    return { id: d.id, state: d.state };
  });
}
