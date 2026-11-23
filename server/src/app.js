import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { healthRouter } from './routes/health.js';

export function createApp() {
  const app = express();
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRouter);

  // Orice rută necunoscută primește același format de eroare.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta nu există' } });
  });

  // Handler central de erori: nu expunem detalii interne în răspuns.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (config.env !== 'test') console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Eroare internă' } });
  });

  return app;
}
