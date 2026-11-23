import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { withWriteTransaction } from '../db.js';
import {
  listInspections, getVisible, serialize, createInspection, saveAnswers, transition,
} from '../services/inspectionService.js';

export const inspectionsRouter = Router();
inspectionsRouter.use(requireAuth);

inspectionsRouter.get('/', async (req, res) => {
  res.json(await listInspections(req.user, req.query));
});

inspectionsRouter.get('/:id', async (req, res) => {
  res.json(serialize(await getVisible(req.user, req.params.id)));
});

inspectionsRouter.post('/', async (req, res) => {
  const { inspection, created } = await withWriteTransaction((transaction) => createInspection(req.user, req.body, { transaction }));
  res.status(created ? 201 : 200).json(inspection);
});

inspectionsRouter.put('/:id/answers', async (req, res) => {
  res.json(await withWriteTransaction((transaction) => saveAnswers(req.user, req.params.id, req.body, { transaction })));
});

inspectionsRouter.post('/:id/transitions', async (req, res) => {
  res.json(await withWriteTransaction((transaction) => transition(req.user, req.params.id, req.body, { transaction })));
});
