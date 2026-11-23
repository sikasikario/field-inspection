import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { ROLE } from '../domain/inspectionStateMachine.js';
import { listDeliveries, retryDelivery } from '../services/deliveryService.js';

export const deliveriesRouter = Router();
deliveriesRouter.use(requireAuth, requireRole(ROLE.COORDINATOR));

deliveriesRouter.get('/', async (req, res) => {
  res.json({ items: await listDeliveries() });
});

deliveriesRouter.post('/:id/retry', async (req, res) => {
  res.json(await retryDelivery(req.params.id));
});
