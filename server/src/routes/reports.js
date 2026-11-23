import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { ROLE } from '../domain/inspectionStateMachine.js';
import { summary } from '../services/reportService.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireRole(ROLE.COORDINATOR));

reportsRouter.get('/summary', async (req, res) => {
  res.json(await summary());
});
