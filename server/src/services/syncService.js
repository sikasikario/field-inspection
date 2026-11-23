// Sincronizarea operațiilor făcute offline. Fiecare operație are un opId (UUID) generat pe client.
// Rezultatul fiecărei operații e salvat în tabela SyncOperation, în aceeași tranzacție cu modificarea.
// Dacă operația sosește din nou (retry, răspuns pierdut), întoarcem rezultatul salvat: nu o reaplicăm.
import { SyncOperation } from '../models/index.js';
import { withWriteTransaction } from '../db.js';
import { toErrorResponse, badRequest } from '../errors.js';
import { isUuid } from '../validation.js';
import { createInspection, saveAnswers, transition } from './inspectionService.js';

export const MAX_BATCH = 50;

const HANDLERS = {
  async create(user, op, transaction) {
    const { inspection, created } = await createInspection(user, { ...op.payload, id: op.inspectionId }, { transaction });
    return { status: created ? 201 : 200, body: inspection };
  },
  async saveAnswers(user, op, transaction) {
    return { status: 200, body: await saveAnswers(user, op.inspectionId, op.payload, { transaction }) };
  },
  async transition(user, op, transaction) {
    return { status: 200, body: await transition(user, op.inspectionId, op.payload, { transaction }) };
  },
};

function validateOperation(op) {
  if (!op || typeof op !== 'object') return 'operația trebuie să fie un obiect';
  if (!isUuid(op.opId)) return 'opId trebuie să fie un UUID';
  if (!Object.hasOwn(HANDLERS, op.type)) return `type trebuie să fie din: ${Object.keys(HANDLERS).join(', ')}`;
  if (!isUuid(op.inspectionId)) return 'inspectionId trebuie să fie un UUID';
  if (!op.payload || typeof op.payload !== 'object' || Array.isArray(op.payload)) return 'payload trebuie să fie un obiect';
  return null;
}

function fromLog(entry, user) {
  // Un opId folosit deja de alt utilizator: nu îi arătăm rezultatul altcuiva.
  if (entry.userId !== user.id) {
    return { status: 409, body: { error: { code: 'OP_ID_CONFLICT', message: 'opId a fost deja folosit' } }, replayed: false };
  }
  return { status: entry.statusCode, body: entry.response, replayed: true };
}

export async function processOperation(user, op) {
  const invalid = validateOperation(op);
  if (invalid) {
    return { opId: op?.opId ?? null, status: 400, body: { error: { code: 'VALIDATION_ERROR', message: invalid } }, replayed: false };
  }

  const result = await withWriteTransaction(async (transaction) => {
    const logged = await SyncOperation.findByPk(op.opId, { transaction });
    if (logged) return fromLog(logged, user);

    let status;
    let body;
    try {
      ({ status, body } = await HANDLERS[op.type](user, op, transaction));
    } catch (err) {
      const mapped = toErrorResponse(err);
      if (mapped.status >= 500) throw err; // eroare temporară: nu o salvăm, clientul poate reîncerca
      ({ status, body } = mapped);
    }
    await SyncOperation.create({ opId: op.opId, userId: user.id, type: op.type, statusCode: status, response: body }, { transaction });
    return { status, body, replayed: false };
  });
  return { opId: op.opId, ...result };
}

/** Procesează un lot de operații în ordine; fiecare are rezultatul ei (o eroare nu oprește restul). */
export async function processBatch(user, body) {
  const operations = body?.operations;
  if (!Array.isArray(operations) || operations.length === 0 || operations.length > MAX_BATCH) {
    throw badRequest(`operations trebuie să fie o listă cu 1–${MAX_BATCH} elemente`);
  }
  const results = [];
  for (const op of operations) results.push(await processOperation(user, op));
  return { results };
}
