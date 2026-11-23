// Utilitare comune pentru teste: bază de date nouă (seed) și autentificare rapidă.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { seed, SEED_PASSWORD } from '../src/seed.js';
import { Inspection, ChecklistItem } from '../src/models/index.js';

export const app = createApp();
export const api = () => request(app);

export async function resetDb() {
  return seed();
}

export async function login(email) {
  const res = await api().post('/api/auth/login').send({ email, password: SEED_PASSWORD });
  if (res.status !== 200) throw new Error(`login eșuat pentru ${email}: ${res.status}`);
  return { token: res.body.token, user: res.body.user, auth: { Authorization: `Bearer ${res.body.token}` } };
}

export const asUsers = async () => ({
  coord: await login('coordonator@demo.ro'),
  ion: await login('ion@demo.ro'),
  maria: await login('maria@demo.ro'),
});

export async function findInspection(where) {
  return Inspection.findOne({ where, order: [['dueDate', 'ASC']] });
}

/** Răspunsuri valide pentru toate întrebările șablonului. */
export async function fullAnswers(templateId) {
  const items = await ChecklistItem.findAll({ where: { templateId }, order: [['position', 'ASC']] });
  return items.map((it) => ({ itemId: it.id, value: it.type === 'yes_no' ? 'da' : it.type === 'number' ? 3 : 'ok' }));
}

export const uuid = () => randomUUID();
