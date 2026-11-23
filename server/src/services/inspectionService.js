// Regulile de business pentru inspecții. Folosite atât de rutele REST, cât și de sincronizare,
// ca o regulă să existe într-un singur loc.
import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import {
  Inspection, Answer, ChecklistItem, ChecklistTemplate, Site, User, ExternalDelivery,
} from '../models/index.js';
import {
  STATUS, ROLE, EDITABLE_STATUSES, applyTransition,
} from '../domain/inspectionStateMachine.js';
import { badRequest, notFound, forbidden, conflict } from '../errors.js';
import {
  requireUuid, requirePositiveInt, optionalPositiveInt, optionalDate, optionalString, requireObject,
} from '../validation.js';

const SUMMARY_INCLUDE = [
  { model: Site, as: 'site', attributes: ['id', 'name'] },
  { model: ChecklistTemplate, as: 'template', attributes: ['id', 'title'] },
  { model: User, as: 'inspector', attributes: ['id', 'name'] },
];

export function serialize(i) {
  const out = {
    id: i.id,
    status: i.status,
    version: i.version,
    templateId: i.templateId,
    siteId: i.siteId,
    inspectorId: i.inspectorId,
    dueDate: i.dueDate,
    notes: i.notes,
    decisionComment: i.decisionComment,
    submittedAt: i.submittedAt,
    decidedAt: i.decidedAt,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
  if (i.site) out.site = { id: i.site.id, name: i.site.name };
  if (i.template) out.template = { id: i.template.id, title: i.template.title };
  if (i.inspector) out.inspector = { id: i.inspector.id, name: i.inspector.name };
  if (i.answers) out.answers = i.answers.map((a) => ({ itemId: a.itemId, value: a.value }));
  return out;
}

// Un inspector vede doar inspecțiile proprii; coordonatorul le vede pe toate.
export const visibilityWhere = (user) => (user.role === ROLE.INSPECTOR ? { inspectorId: user.id } : {});

const loadFull = (id, transaction) => Inspection.findByPk(id, {
  include: [...SUMMARY_INCLUDE, { model: Answer, as: 'answers' }],
  transaction,
});

/** Întoarce inspecția doar dacă utilizatorul are voie să o vadă; altfel 404 (nu dezvăluim că există). */
export async function getVisible(user, id, { transaction } = {}) {
  requireUuid(id, 'id');
  const inspection = await loadFull(id, transaction);
  if (!inspection || (user.role === ROLE.INSPECTOR && inspection.inspectorId !== user.id)) {
    throw notFound('Inspecția nu există');
  }
  return inspection;
}

const SORTS = {
  dueDate: [['dueDate', 'ASC'], ['id', 'ASC']],
  '-dueDate': [['dueDate', 'DESC'], ['id', 'ASC']],
  updatedAt: [['updatedAt', 'ASC'], ['id', 'ASC']],
  '-updatedAt': [['updatedAt', 'DESC'], ['id', 'ASC']],
};

export async function listInspections(user, query) {
  const where = { ...visibilityWhere(user) };

  if (query.status) {
    const statuses = String(query.status).split(',');
    const valid = Object.values(STATUS);
    if (!statuses.every((s) => valid.includes(s))) throw badRequest(`status trebuie să fie din: ${valid.join(', ')}`);
    where.status = { [Op.in]: statuses };
  }
  const siteId = optionalPositiveInt(query.siteId, 'siteId');
  if (siteId) where.siteId = siteId;
  const inspectorId = optionalPositiveInt(query.inspectorId, 'inspectorId');
  if (inspectorId && user.role === ROLE.COORDINATOR) where.inspectorId = inspectorId;
  const dueFrom = optionalDate(query.dueFrom, 'dueFrom');
  const dueTo = optionalDate(query.dueTo, 'dueTo');
  if (dueFrom || dueTo) {
    where.dueDate = {};
    if (dueFrom) where.dueDate[Op.gte] = dueFrom;
    if (dueTo) where.dueDate[Op.lte] = dueTo;
  }

  const sort = query.sort ?? 'dueDate';
  if (!SORTS[sort]) throw badRequest(`sort trebuie să fie din: ${Object.keys(SORTS).join(', ')}`);
  const page = optionalPositiveInt(query.page, 'page') ?? 1;
  const pageSize = optionalPositiveInt(query.pageSize, 'pageSize') ?? 20;
  if (pageSize > 100) throw badRequest('pageSize poate fi maximum 100');

  const { rows, count } = await Inspection.findAndCountAll({
    where,
    include: SUMMARY_INCLUDE,
    order: SORTS[sort],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true,
  });
  return {
    items: rows.map(serialize),
    page,
    pageSize,
    total: count,
    totalPages: Math.ceil(count / pageSize),
  };
}

/**
 * Creează o inspecție. ID-ul vine de la client (UUID), deci operația e idempotentă:
 * dacă aceeași inspecție e trimisă din nou, întoarcem inspecția existentă, fără duplicat.
 */
export async function createInspection(user, body, { transaction } = {}) {
  requireObject(body);
  const id = requireUuid(body.id, 'id');

  const existing = await Inspection.findByPk(id, { transaction });
  if (existing) {
    if (existing.createdById === user.id) {
      return { inspection: serialize(await loadFull(id, transaction)), created: false };
    }
    throw conflict('ID_CONFLICT', 'Există deja o inspecție cu acest ID');
  }

  const templateId = requirePositiveInt(body.templateId, 'templateId');
  const siteId = requirePositiveInt(body.siteId, 'siteId');
  const dueDate = optionalDate(body.dueDate, 'dueDate');
  const notes = optionalString(body.notes, 'notes');

  const template = await ChecklistTemplate.findByPk(templateId, { transaction });
  if (!template || !template.active) throw badRequest('Șablonul nu există sau nu e activ');
  if (!(await Site.findByPk(siteId, { transaction }))) throw badRequest('Locația nu există');

  let inspectorId;
  let status;
  if (user.role === ROLE.COORDINATOR) {
    inspectorId = requirePositiveInt(body.inspectorId, 'inspectorId');
    const inspector = await User.findByPk(inspectorId, { transaction });
    if (!inspector || inspector.role !== ROLE.INSPECTOR) throw badRequest('inspectorId nu este un inspector');
    status = STATUS.ASSIGNED;
  } else {
    if (body.inspectorId !== undefined && Number(body.inspectorId) !== user.id) {
      throw forbidden('Un inspector poate crea inspecții doar pentru sine');
    }
    inspectorId = user.id;
    status = STATUS.IN_PROGRESS; // inspecție neplanificată: începe direct în lucru
  }

  await Inspection.create(
    { id, templateId, siteId, inspectorId, createdById: user.id, status, dueDate, notes },
    { transaction },
  );
  return { inspection: serialize(await loadFull(id, transaction)), created: true };
}

function normalizeValue(item, value) {
  if (value === null) return null; // null = ștergerea răspunsului
  switch (item.type) {
    case 'yes_no':
      if (value !== 'da' && value !== 'nu') throw badRequest(`Întrebarea ${item.id} acceptă doar „da” sau „nu”`);
      return value;
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (value === '' || typeof value === 'boolean' || !Number.isFinite(n)) throw badRequest(`Întrebarea ${item.id} acceptă doar numere`);
      return String(n);
    }
    default:
      return optionalString(value, `Răspunsul la întrebarea ${item.id}`) ?? null;
  }
}

/** Actualizează versiunea doar dacă nu s-a schimbat între timp (verificare atomică în baza de date). */
async function bumpVersion(inspection, baseVersion, patch, transaction) {
  const [count] = await Inspection.update(
    { ...patch, version: baseVersion + 1 },
    { where: { id: inspection.id, version: baseVersion }, transaction },
  );
  if (count === 0) throw conflict('VERSION_CONFLICT', 'Inspecția a fost modificată între timp');
}

/**
 * Salvează răspunsuri. Politica de conflict:
 * - inspecția trebuie să fie într-o stare editabilă, altfel 409 NOT_EDITABLE (serverul câștigă);
 * - baseVersion trebuie să fie versiunea curentă, altfel 409 VERSION_CONFLICT.
 * În ambele cazuri trimitem varianta de pe server, ca clientul să poată decide.
 */
export async function saveAnswers(user, id, body, { transaction } = {}) {
  if (user.role !== ROLE.INSPECTOR) throw forbidden('Doar inspectorul completează răspunsuri');
  requireObject(body);
  const inspection = await getVisible(user, id, { transaction });
  const baseVersion = requirePositiveInt(body.baseVersion, 'baseVersion');
  const { answers } = body;
  if (!Array.isArray(answers) || answers.length === 0 || answers.length > 200) {
    throw badRequest('answers trebuie să fie o listă cu 1–200 elemente');
  }

  if (!EDITABLE_STATUSES.includes(inspection.status)) {
    throw conflict('NOT_EDITABLE', `Inspecția este în starea ${inspection.status} și nu mai poate fi modificată`, { server: serialize(inspection) });
  }
  if (inspection.version !== baseVersion) {
    throw conflict('VERSION_CONFLICT', 'Inspecția a fost modificată între timp', { server: serialize(inspection) });
  }

  const items = new Map(
    (await ChecklistItem.findAll({ where: { templateId: inspection.templateId }, transaction })).map((it) => [it.id, it]),
  );
  const seen = new Set();
  const normalized = answers.map((a) => {
    const item = items.get(Number(a?.itemId));
    if (!item) throw badRequest(`itemId ${a?.itemId} nu aparține șablonului inspecției`);
    if (seen.has(item.id)) throw badRequest(`itemId ${item.id} apare de două ori`);
    seen.add(item.id);
    return { itemId: item.id, value: normalizeValue(item, a.value) };
  });

  const status = inspection.status === STATUS.ASSIGNED ? STATUS.IN_PROGRESS : inspection.status;
  await bumpVersion(inspection, baseVersion, { status }, transaction);

  for (const { itemId, value } of normalized) {
    const existing = await Answer.findOne({ where: { inspectionId: id, itemId }, transaction });
    if (value === null) await existing?.destroy({ transaction });
    else if (existing) await existing.update({ value }, { transaction });
    else await Answer.create({ inspectionId: id, itemId, value }, { transaction });
  }
  return serialize(await loadFull(id, transaction));
}

async function countMissingRequired(inspection, transaction) {
  const required = await ChecklistItem.findAll({ where: { templateId: inspection.templateId, required: true }, transaction });
  const answered = new Set(
    inspection.answers.filter((a) => a.value !== null && a.value !== '').map((a) => a.itemId),
  );
  return required.filter((it) => !answered.has(it.id)).length;
}

export async function transition(user, id, body, { transaction } = {}) {
  requireObject(body);
  const inspection = await getVisible(user, id, { transaction });
  const comment = optionalString(body.comment, 'comment', 1000);
  const missingRequiredItems = body.action === 'submit' ? await countMissingRequired(inspection, transaction) : 0;

  // Mai întâi regulile (rol, proprietar, stare), apoi versiunea.
  const to = applyTransition({ action: body.action, inspection, user, context: { comment, missingRequiredItems } });

  const baseVersion = requirePositiveInt(body.baseVersion, 'baseVersion');
  if (inspection.version !== baseVersion) {
    throw conflict('VERSION_CONFLICT', 'Inspecția a fost modificată între timp', { server: serialize(inspection) });
  }

  const now = new Date();
  const patch = { status: to };
  if (body.action === 'submit') patch.submittedAt = now;
  if (body.action === 'approve' || body.action === 'reject') {
    patch.decidedAt = now;
    patch.decisionComment = comment ?? null;
  }
  await bumpVersion(inspection, baseVersion, patch, transaction);

  // Pachetul EXT (outbox): aprobarea doar programează livrarea; trimiterea o face worker-ul.
  // Așa aprobarea nu depinde de disponibilitatea registrului extern.
  if (body.action === 'approve') {
    await ExternalDelivery.create(
      { inspectionId: id, idempotencyKey: randomUUID(), state: 'PENDING', nextAttemptAt: now },
      { transaction },
    );
  }
  return serialize(await loadFull(id, transaction));
}

/** Tot ce are nevoie clientul ca să lucreze offline: inspecțiile modificate de la `since`. */
export async function pullChanges(user, since) {
  const serverTime = new Date().toISOString();
  const where = { ...visibilityWhere(user) };
  if (since) {
    const d = new Date(since);
    if (Number.isNaN(d.getTime())) throw badRequest('since trebuie să fie o dată ISO validă');
    where.updatedAt = { [Op.gt]: d };
  }
  const inspections = await Inspection.findAll({
    where,
    include: [...SUMMARY_INCLUDE, { model: Answer, as: 'answers' }],
    order: [['updatedAt', 'ASC']],
  });
  return { serverTime, inspections: inspections.map(serialize) };
}
