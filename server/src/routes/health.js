import { Router } from 'express';
import { sequelize } from '../db.js';

export const healthRouter = Router();

healthRouter.get('/', async (req, res) => {
  await sequelize.authenticate();
  res.json({ status: 'ok', time: new Date().toISOString() });
});
