import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { toErrorResponse } from './errors.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { referenceRouter } from './routes/reference.js';
import { inspectionsRouter } from './routes/inspections.js';
import { syncRouter } from './routes/sync.js';
import { reportsRouter } from './routes/reports.js';
import { deliveriesRouter } from './routes/deliveries.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/inspections', inspectionsRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/deliveries', deliveriesRouter);
  app.use('/api', referenceRouter);

  // Orice rută necunoscută primește același format de eroare.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta nu există' } });
  });

  // Handler central de erori: același format pentru toate; fără detalii interne în răspuns.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const { status, body } = toErrorResponse(err);
    if (status >= 500 && config.env !== 'test') console.error(err);
    res.status(status).json(body);
  });

  return app;
}
