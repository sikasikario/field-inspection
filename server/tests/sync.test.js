import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, asUsers, findInspection, fullAnswers, uuid } from './helpers.js';
import { Inspection, Answer, SyncOperation } from '../src/models/index.js';

let u;
beforeEach(async () => {
  await resetDb();
  u = await asUsers();
});

const sync = (who, operations) => api().post('/api/sync').set(who.auth).send({ operations });

describe('sincronizare: scenariul offline complet', () => {
  it('creare + răspunsuri + trimitere făcute offline, trimise într-un lot', async () => {
    const id = uuid();
    const answers = await fullAnswers(1);
    const ops = [
      { opId: uuid(), type: 'create', inspectionId: id, payload: { templateId: 1, siteId: 3 } },
      { opId: uuid(), type: 'saveAnswers', inspectionId: id, payload: { baseVersion: 1, answers } },
      { opId: uuid(), type: 'transition', inspectionId: id, payload: { action: 'submit', baseVersion: 2 } },
    ];
    const res = await sync(u.ion, ops);
    expect(res.status).toBe(200);
    expect(res.body.results.map((r) => r.status)).toEqual([201, 200, 200]);
    expect(res.body.results[2].body).toMatchObject({ status: 'SUBMITTED', version: 3 });
  });

  it('retransmiterea întregului lot nu produce duplicate și întoarce aceleași rezultate', async () => {
    const id = uuid();
    const ops = [
      { opId: uuid(), type: 'create', inspectionId: id, payload: { templateId: 1, siteId: 3 } },
      { opId: uuid(), type: 'saveAnswers', inspectionId: id, payload: { baseVersion: 1, answers: await fullAnswers(1) } },
    ];
    const first = await sync(u.ion, ops);
    const second = await sync(u.ion, ops);
    const third = await sync(u.ion, ops);

    expect(second.body.results.map((r) => r.replayed)).toEqual([true, true]);
    expect(third.body.results.map((r) => r.body)).toEqual(first.body.results.map((r) => r.body));
    expect(await Inspection.count({ where: { id } })).toBe(1);
    expect((await Inspection.findByPk(id)).version).toBe(2); // modificarea s-a aplicat o singură dată
    expect(await Answer.count({ where: { inspectionId: id } })).toBe((await fullAnswers(1)).length);
  });

  it('aceeași operație trimisă de 5 ori în paralel e aplicată o singură dată', async () => {
    const insp = await findInspection({ inspectorId: u.ion.user.id, status: 'ASSIGNED' });
    const op = { opId: uuid(), type: 'saveAnswers', inspectionId: insp.id, payload: { baseVersion: 1, answers: (await fullAnswers(insp.templateId)).slice(0, 1) } };
    const responses = await Promise.all(Array.from({ length: 5 }, () => sync(u.ion, [op])));
    const results = responses.map((r) => r.body.results[0]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect((await Inspection.findByPk(insp.id)).version).toBe(2);
    expect(await SyncOperation.count({ where: { opId: op.opId } })).toBe(1);
  });

  it('conflictul e raportat per operație, iar restul lotului continuă', async () => {
    const insp = await findInspection({ inspectorId: u.ion.user.id, status: 'ASSIGNED' });
    const answers = (await fullAnswers(insp.templateId)).slice(0, 1);
    // Între timp, inspecția a fost modificată de pe alt dispozitiv (versiunea devine 2).
    await api().put(`/api/inspections/${insp.id}/answers`).set(u.ion.auth).send({ baseVersion: 1, answers });

    const other = await findInspection({ inspectorId: u.ion.user.id, status: 'REJECTED' });
    const res = await sync(u.ion, [
      { opId: uuid(), type: 'saveAnswers', inspectionId: insp.id, payload: { baseVersion: 1, answers } },
      { opId: uuid(), type: 'transition', inspectionId: other.id, payload: { action: 'reopen', baseVersion: other.version } },
    ]);
    const [conflictResult, okResult] = res.body.results;
    expect(conflictResult.status).toBe(409);
    expect(conflictResult.body.error.code).toBe('VERSION_CONFLICT');
    expect(conflictResult.body.error.details.server.version).toBe(2);
    expect(okResult.status).toBe(200);
  });

  it('coordonatorul a aprobat între timp: editarea offline e refuzată (serverul câștigă)', async () => {
    const insp = await findInspection({ inspectorId: u.ion.user.id, status: 'SUBMITTED' });
    await api().post(`/api/inspections/${insp.id}/transitions`).set(u.coord.auth).send({ action: 'approve', baseVersion: insp.version });
    const res = await sync(u.ion, [{ opId: uuid(), type: 'saveAnswers', inspectionId: insp.id, payload: { baseVersion: insp.version, answers: (await fullAnswers(insp.templateId)).slice(0, 1) } }]);
    expect(res.body.results[0].status).toBe(409);
    expect(res.body.results[0].body.error.code).toBe('NOT_EDITABLE');
  });

  it('un opId deja folosit de alt utilizator nu dezvăluie rezultatul', async () => {
    const op = { opId: uuid(), type: 'create', inspectionId: uuid(), payload: { templateId: 1, siteId: 1 } };
    await sync(u.ion, [op]);
    const res = await sync(u.maria, [op]);
    expect(res.body.results[0].status).toBe(409);
    expect(res.body.results[0].body.error.code).toBe('OP_ID_CONFLICT');
    expect(JSON.stringify(res.body)).not.toContain(op.inspectionId);
  });

  it('operațiile invalide primesc 400 individual; lotul gol sau prea mare → 400', async () => {
    const res = await sync(u.ion, [
      { opId: 'x', type: 'create', inspectionId: uuid(), payload: {} },
      { opId: uuid(), type: 'delete', inspectionId: uuid(), payload: {} },
      { opId: uuid(), type: 'create', inspectionId: 'y', payload: {} },
      { opId: uuid(), type: 'create', inspectionId: uuid(), payload: [] },
      null,
    ]);
    expect(res.body.results.map((r) => r.status)).toEqual([400, 400, 400, 400, 400]);
    expect((await sync(u.ion, [])).status).toBe(400);
    expect((await sync(u.ion, Array.from({ length: 51 }, () => ({})))).status).toBe(400);
  });

  it('sincronizarea cere autentificare și respectă confidențialitatea', async () => {
    expect((await api().post('/api/sync').send({ operations: [] })).status).toBe(401);
    const maria = await findInspection({ inspectorId: u.maria.user.id, status: 'ASSIGNED' });
    const res = await sync(u.ion, [{ opId: uuid(), type: 'saveAnswers', inspectionId: maria.id, payload: { baseVersion: 1, answers: [{ itemId: 1, value: 'da' }] } }]);
    expect(res.body.results[0].status).toBe(404);
  });
});

describe('descărcarea modificărilor (pull)', () => {
  it('prima descărcare aduce toate inspecțiile proprii, cu răspunsuri', async () => {
    const res = await api().get('/api/sync/pull').set(u.ion.auth);
    expect(res.status).toBe(200);
    expect(res.body.inspections).toHaveLength(12);
    expect(res.body.inspections.every((i) => i.inspectorId === u.ion.user.id && Array.isArray(i.answers))).toBe(true);
    expect(res.body.serverTime).toBeTruthy();
  });

  it('descărcarea incrementală aduce doar ce s-a schimbat de la ultima sincronizare', async () => {
    const first = await api().get('/api/sync/pull').set(u.ion.auth);
    await new Promise((r) => setTimeout(r, 5));
    const insp = await findInspection({ inspectorId: u.ion.user.id, status: 'SUBMITTED' });
    await api().post(`/api/inspections/${insp.id}/transitions`).set(u.coord.auth).send({ action: 'reject', baseVersion: insp.version, comment: 'Refă' });
    const next = await api().get(`/api/sync/pull?since=${encodeURIComponent(first.body.serverTime)}`).set(u.ion.auth);
    expect(next.body.inspections.map((i) => i.id)).toEqual([insp.id]);
    expect(next.body.inspections[0].status).toBe('REJECTED');
    expect((await api().get('/api/sync/pull?since=ieri').set(u.ion.auth)).status).toBe(400);
  });
});
