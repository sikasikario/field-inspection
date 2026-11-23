import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { processBatch } from '../services/syncService.js';
import { pullChanges } from '../services/inspectionService.js';

export const syncRouter = Router();
syncRouter.use(requireAuth);

// Trimiterea operațiilor făcute offline (lot, idempotent pe opId).
syncRouter.post('/', async (req, res) => {
  res.json(await processBatch(req.user, req.body));
});

// Descărcarea modificărilor de pe server de la ultima sincronizare.
syncRouter.get('/pull', async (req, res) => {
  res.json(await pullChanges(req.user, req.query.since));
});
