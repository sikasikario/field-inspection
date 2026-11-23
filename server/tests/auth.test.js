import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { api, resetDb, login } from './helpers.js';

beforeAll(resetDb);

describe('autentificare', () => {
  it('login corect întoarce token și utilizatorul, fără hash-ul parolei', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'ION@demo.ro ', password: 'parola123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ email: 'ion@demo.ro', role: 'inspector' });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('parolă greșită sau email inexistent → 401 cu același mesaj', async () => {
    const a = await api().post('/api/auth/login').send({ email: 'ion@demo.ro', password: 'gresit' });
    const b = await api().post('/api/auth/login').send({ email: 'nimeni@demo.ro', password: 'gresit' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('câmpuri lipsă → 400; JSON invalid → 400', async () => {
    expect((await api().post('/api/auth/login').send({ email: 'ion@demo.ro' })).status).toBe(400);
    const bad = await api().post('/api/auth/login').set('Content-Type', 'application/json').send('{nu e json');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_JSON');
  });

  it('/me cere token valid', async () => {
    const { auth } = await login('maria@demo.ro');
    expect((await api().get('/api/auth/me').set(auth)).body.user.email).toBe('maria@demo.ro');
    expect((await api().get('/api/auth/me')).status).toBe(401);
    expect((await api().get('/api/auth/me').set('Authorization', 'Bearer abc')).status).toBe(401);
    expect((await api().get('/api/auth/me').set('Authorization', 'Basic abc')).status).toBe(401);
  });

  it('token semnat cu alt secret sau pentru un utilizator inexistent → 401', async () => {
    const forged = jwt.sign({ sub: 1, role: 'coordinator' }, 'alt-secret');
    expect((await api().get('/api/auth/me').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
    const ghost = jwt.sign({ sub: 9999, role: 'coordinator' }, 'test-secret');
    expect((await api().get('/api/auth/me').set('Authorization', `Bearer ${ghost}`)).status).toBe(401);
  });
});

describe('date de referință și permisiuni pe rol', () => {
  it('locațiile și șabloanele (cu întrebări) sunt disponibile ambelor roluri', async () => {
    const { auth } = await login('ion@demo.ro');
    const sites = await api().get('/api/sites').set(auth);
    const templates = await api().get('/api/templates').set(auth);
    expect(sites.body.items).toHaveLength(5);
    expect(templates.body.items[0].items.length).toBeGreaterThan(0);
  });

  it('lista de inspectori e doar pentru coordonator', async () => {
    const ion = await login('ion@demo.ro');
    const coord = await login('coordonator@demo.ro');
    expect((await api().get('/api/users').set(ion.auth)).status).toBe(403);
    const res = await api().get('/api/users').set(coord.auth);
    expect(res.body.items).toHaveLength(3);
  });

  it('rapoartele și livrările sunt interzise inspectorului', async () => {
    const { auth } = await login('ion@demo.ro');
    expect((await api().get('/api/reports/summary').set(auth)).status).toBe(403);
    expect((await api().get('/api/deliveries').set(auth)).status).toBe(403);
  });
});
