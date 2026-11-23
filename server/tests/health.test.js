import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { sequelize } from '../src/models/index.js';

const app = createApp();

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

describe('API de bază', () => {
  it('GET /api/health răspunde ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('o rută inexistentă întoarce 404 în formatul standard de eroare', async () => {
    const res = await request(app).get('/api/nu-exista');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
