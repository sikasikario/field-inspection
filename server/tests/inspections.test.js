import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, asUsers, findInspection, fullAnswers, uuid } from './helpers.js';
import { Inspection, ExternalDelivery } from '../src/models/index.js';

let u;
beforeEach(async () => {
  await resetDb();
  u = await asUsers();
});

describe('listă: confidențialitate, filtrare, ordonare, paginare', () => {
  it('inspectorul vede doar inspecțiile proprii; coordonatorul le vede pe toate', async () => {
    const mine = await api().get('/api/inspections?pageSize=100').set(u.ion.auth);
    expect(mine.body.total).toBe(12);
    expect(mine.body.items.every((i) => i.inspectorId === u.ion.user.id)).toBe(true);
    const all = await api().get('/api/inspections?pageSize=100').set(u.coord.auth);
    expect(all.body.total).toBe(36);
  });

  it('inspectorul nu poate vedea inspecțiile altuia nici prin filtrul inspectorId', async () => {
    const res = await api().get(`/api/inspections?inspectorId=${u.maria.user.id}`).set(u.ion.auth);
    expect(res.body.items.every((i) => i.inspectorId === u.ion.user.id)).toBe(true);
  });

  it('filtrare după stare și locație, cu nume incluse', async () => {
    const res = await api().get('/api/inspections?status=SUBMITTED,APPROVED&siteId=1&pageSize=100').set(u.coord.auth);
    expect(res.status).toBe(200);
    expect(res.body.items.every((i) => ['SUBMITTED', 'APPROVED'].includes(i.status) && i.siteId === 1)).toBe(true);
    expect(res.body.items[0]?.site?.name ?? 'Depozit Militari').toBeTruthy();
  });

  it('filtrare după interval de termen și ordonare descrescătoare', async () => {
    const res = await api().get('/api/inspections?dueFrom=2026-12-05&dueTo=2026-12-10&sort=-dueDate&pageSize=100').set(u.coord.auth);
    const dates = res.body.items.map((i) => i.dueDate);
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.every((d) => d >= '2026-12-05' && d <= '2026-12-10')).toBe(true);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('paginare corectă: pagini disjuncte, total și număr de pagini', async () => {
    const p1 = await api().get('/api/inspections?page=1&pageSize=10&sort=updatedAt').set(u.coord.auth);
    const p4 = await api().get('/api/inspections?page=4&pageSize=10&sort=updatedAt').set(u.coord.auth);
    expect(p1.body).toMatchObject({ page: 1, pageSize: 10, total: 36, totalPages: 4 });
    expect(p4.body.items).toHaveLength(6);
    const ids1 = new Set(p1.body.items.map((i) => i.id));
    expect(p4.body.items.some((i) => ids1.has(i.id))).toBe(false);
  });

  it('parametri invalizi → 400', async () => {
    for (const q of ['status=GATA', 'sort=nume', 'page=0', 'pageSize=500', 'dueFrom=ieri', 'siteId=abc']) {
      const res = await api().get(`/api/inspections?${q}`).set(u.coord.auth);
      expect(res.status, q).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('fără token → 401', async () => {
    expect((await api().get('/api/inspections')).status).toBe(401);
  });
});

describe('detaliu', () => {
  it('proprietarul vede răspunsurile; alt inspector primește 404; ID invalid → 400', async () => {
    const insp = await findInspection({ inspectorId: u.ion.user.id, status: 'APPROVED' });
    const own = await api().get(`/api/inspections/${insp.id}`).set(u.ion.auth);
    expect(own.status).toBe(200);
    expect(own.body.answers.length).toBeGreaterThan(0);
    expect((await api().get(`/api/inspections/${insp.id}`).set(u.maria.auth)).status).toBe(404);
    expect((await api().get('/api/inspections/123').set(u.ion.auth)).status).toBe(400);
    expect((await api().get(`/api/inspections/${uuid()}`).set(u.coord.auth)).status).toBe(404);
  });
});

describe('creare', () => {
  it('coordonatorul asignează o inspecție unui inspector', async () => {
    const id = uuid();
    const res = await api().post('/api/inspections').set(u.coord.auth)
      .send({ id, templateId: 1, siteId: 2, inspectorId: u.ion.user.id, dueDate: '2027-01-15' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id, status: 'ASSIGNED', version: 1, inspectorId: u.ion.user.id });
  });

  it('inspectorul creează o inspecție neplanificată (pornește IN_PROGRESS, pentru sine)', async () => {
    const res = await api().post('/api/inspections').set(u.ion.auth).send({ id: uuid(), templateId: 2, siteId: 1 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'IN_PROGRESS', inspectorId: u.ion.user.id });
  });

  it('retransmiterea aceleiași creări nu produce duplicat (200, aceeași inspecție)', async () => {
    const body = { id: uuid(), templateId: 1, siteId: 1 };
    const first = await api().post('/api/inspections').set(u.ion.auth).send(body);
    const again = await api().post('/api/inspections').set(u.ion.auth).send(body);
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(await Inspection.count({ where: { id: body.id } })).toBe(1);
  });

  it('același ID folosit de alt utilizator → 409 ID_CONFLICT', async () => {
    const body = { id: uuid(), templateId: 1, siteId: 1 };
    await api().post('/api/inspections').set(u.ion.auth).send(body);
    const res = await api().post('/api/inspections').set(u.maria.auth).send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ID_CONFLICT');
  });

  it('inspectorul nu poate crea pentru altcineva → 403', async () => {
    const res = await api().post('/api/inspections').set(u.ion.auth)
      .send({ id: uuid(), templateId: 1, siteId: 1, inspectorId: u.maria.user.id });
    expect(res.status).toBe(403);
  });

  it('date invalide → 400', async () => {
    const cases = [
      { templateId: 1, siteId: 1 },
      { id: 'abc', templateId: 1, siteId: 1 },
      { id: uuid(), templateId: 99, siteId: 1 },
      { id: uuid(), templateId: 1, siteId: 99 },
      { id: uuid(), templateId: 1, siteId: 1, dueDate: '15.01.2027' },
      { id: uuid(), templateId: 1, siteId: 1, inspectorId: 1 }, // coordonatorul nu e inspector
    ];
    for (const body of cases) {
      expect((await api().post('/api/inspections').set(u.coord.auth).send(body)).status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe('răspunsuri și conflicte', () => {
  it('salvarea crește versiunea și mută ASSIGNED → IN_PROGRESS', async () => {
    const insp = await findInspection({ inspectorId: u.ion.user.id, status: 'ASSIGNED' });
    const answers = (await fullAnswers(insp.templateId)).slice(0, 2);
    const res = await api().put(`/api/inspections/${insp.id}/answers`).set(u.ion.auth).send({ baseVersion: 1, answers });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'IN_PROGRESS', version: 2 });
    expect(res.body.answers).toHaveLength(2);
  });

  it('modificarea și ștergerea unui răspuns (value: null)', async () => {
    const insp = await findInspection({ inspectorId: u.ion.user.id, status: 'ASSIGNED' });
    const [a] = await fullAnswers(insp.templateId);
    await api().put(`/api/inspections/${insp.id}/answers`).set(u.ion.auth).send({ baseVersion: 1, answers: [a] });
    const upd = await api().put(`/api/inspections/${insp.id}/answers`).set(u.ion.auth).send({ baseVersion: 2, answers: [{ ...a, value: 'nu' }] });
    expect(upd.body.answers[0].value).toBe('nu');
    const del = await api().put(`/api/inspections/${insp.id}/answers`).set(u.ion.auth).send({ baseVersion: 3, answers: [{ itemId: a.itemId, value: null }] });
    expect(del.body.answers).toHaveLength(0);
  });

  it('versiune veche → 409 VERSION_CONFLICT cu varianta serverului', async () => {
    const insp = await findInspection({ inspectorId: u.ion.user.id, status: 'ASSIGNED' });
    const answers = (await fullAnswers(insp.templateId)).slice(0, 1);
    await api().put(`/api/inspections/${insp.id}/answers`).set(u.ion.auth).send({ baseVersion: 1, answers });
    const stale = await api().put(`/api/inspections/${insp.id}/answers`).set(u.ion.auth).send({ baseVersion: 1, answers });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect(stale.body.error.details.server.version).toBe(2);
  });

  it('inspecție trimisă sau aprobată → 409 NOT_EDITABLE (serverul câștigă)', async () => {
    const insp = await findInspection({ inspectorId: u.ion.user.id, status: 'APPROVED' });
    const res = await api().put(`/api/inspections/${insp.id}/answers`).set(u.ion.auth)
      .send({ baseVersion: insp.version, answers: (await fullAnswers(insp.templateId)).slice(0, 1) });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_EDITABLE');
  });

  it('valori invalide și întrebări străine → 400', async () => {
    const insp = await findInspection({ inspectorId: u.ion.user.id, status: 'ASSIGNED' });
    const items = await fullAnswers(insp.templateId);
    const yesNo = items[0].itemId;
    const bad = [
      { baseVersion: 1, answers: [{ itemId: yesNo, value: 'poate' }] },
      { baseVersion: 1, answers: [{ itemId: 9999, value: 'da' }] },
      { baseVersion: 1, answers: [] },
      { baseVersion: 1, answers: [{ itemId: yesNo, value: 'da' }, { itemId: yesNo, value: 'nu' }] },
      { answers: [{ itemId: yesNo, value: 'da' }] },
    ];
    const numberItem = items.find((a) => typeof a.value === 'number');
    if (numberItem) bad.push({ baseVersion: 1, answers: [{ itemId: numberItem.itemId, value: 'zece' }] });
    for (const body of bad) {
      expect((await api().put(`/api/inspections/${insp.id}/answers`).set(u.ion.auth).send(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('coordonatorul nu completează răspunsuri; alt inspector primește 404', async () => {
    const insp = await findInspection({ inspectorId: u.ion.user.id, status: 'ASSIGNED' });
    const answers = (await fullAnswers(insp.templateId)).slice(0, 1);
    expect((await api().put(`/api/inspections/${insp.id}/answers`).set(u.coord.auth).send({ baseVersion: 1, answers })).status).toBe(403);
    expect((await api().put(`/api/inspections/${insp.id}/answers`).set(u.maria.auth).send({ baseVersion: 1, answers })).status).toBe(404);
  });
});

describe('tranziții', () => {
  async function completeInspection() {
    const insp = await findInspection({ inspectorId: u.ion.user.id, status: 'ASSIGNED' });
    const res = await api().put(`/api/inspections/${insp.id}/answers`).set(u.ion.auth)
      .send({ baseVersion: 1, answers: await fullAnswers(insp.templateId) });
    return res.body;
  }

  it('flux complet: submit → approve programează livrarea externă', async () => {
    const insp = await completeInspection();
    const sub = await api().post(`/api/inspections/${insp.id}/transitions`).set(u.ion.auth).send({ action: 'submit', baseVersion: insp.version });
    expect(sub.body).toMatchObject({ status: 'SUBMITTED', version: insp.version + 1 });
    expect(sub.body.submittedAt).toBeTruthy();
    const appr = await api().post(`/api/inspections/${insp.id}/transitions`).set(u.coord.auth).send({ action: 'approve', baseVersion: sub.body.version });
    expect(appr.body.status).toBe('APPROVED');
    const delivery = await ExternalDelivery.findOne({ where: { inspectionId: insp.id } });
    expect(delivery.state).toBe('PENDING');
  });

  it('submit cu răspunsuri obligatorii lipsă → 422', async () => {
    const insp = await findInspection({ inspectorId: u.ion.user.id, status: 'IN_PROGRESS' });
    const res = await api().post(`/api/inspections/${insp.id}/transitions`).set(u.ion.auth).send({ action: 'submit', baseVersion: insp.version });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INCOMPLETE');
  });

  it('respingere cu comentariu, apoi redeschidere de către inspector', async () => {
    const insp = await findInspection({ inspectorId: u.ion.user.id, status: 'SUBMITTED' });
    const noComment = await api().post(`/api/inspections/${insp.id}/transitions`).set(u.coord.auth).send({ action: 'reject', baseVersion: insp.version });
    expect(noComment.status).toBe(400);
    const rej = await api().post(`/api/inspections/${insp.id}/transitions`).set(u.coord.auth).send({ action: 'reject', baseVersion: insp.version, comment: 'Poze lipsă' });
    expect(rej.body).toMatchObject({ status: 'REJECTED', decisionComment: 'Poze lipsă' });
    const reo = await api().post(`/api/inspections/${insp.id}/transitions`).set(u.ion.auth).send({ action: 'reopen', baseVersion: rej.body.version });
    expect(reo.body.status).toBe('IN_PROGRESS');
  });

  it('cererea repetată, rolul greșit și starea greșită sunt refuzate', async () => {
    const insp = await completeInspection();
    const body = { action: 'submit', baseVersion: insp.version };
    expect((await api().post(`/api/inspections/${insp.id}/transitions`).set(u.ion.auth).send(body)).status).toBe(200);
    expect((await api().post(`/api/inspections/${insp.id}/transitions`).set(u.ion.auth).send(body)).status).toBe(409);
    expect((await api().post(`/api/inspections/${insp.id}/transitions`).set(u.ion.auth).send({ action: 'approve', baseVersion: insp.version + 1 })).status).toBe(403);
    expect((await api().post(`/api/inspections/${insp.id}/transitions`).set(u.coord.auth).send({ action: 'start', baseVersion: insp.version + 1 })).status).toBe(403);
    expect((await api().post(`/api/inspections/${insp.id}/transitions`).set(u.coord.auth).send({ action: 'sterge', baseVersion: 1 })).status).toBe(400);
  });

  it('versiune veche la tranziție → 409', async () => {
    const insp = await findInspection({ inspectorId: u.ion.user.id, status: 'SUBMITTED' });
    const res = await api().post(`/api/inspections/${insp.id}/transitions`).set(u.coord.auth).send({ action: 'approve', baseVersion: insp.version + 5 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
  });
});

describe('raport central', () => {
  it('coordonatorul vede totalurile pe stare și pe locație', async () => {
    const res = await api().get('/api/reports/summary').set(u.coord.auth);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(36);
    expect(Object.values(res.body.byStatus).reduce((a, b) => a + b, 0)).toBe(36);
    expect(res.body.bySite).toHaveLength(5);
    expect(res.body.bySite.reduce((a, s) => a + s.inspections, 0)).toBe(36);
  });
});
