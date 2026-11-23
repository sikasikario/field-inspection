// Date de referință, descărcate de client pentru lucrul offline.
import { Router } from 'express';
import { Site, ChecklistTemplate, ChecklistItem, User } from '../models/index.js';
import { requireAuth, requireRole } from '../auth.js';
import { ROLE } from '../domain/inspectionStateMachine.js';

export const referenceRouter = Router();
referenceRouter.get('/sites', requireAuth, async (req, res) => {
  const sites = await Site.findAll({ attributes: ['id', 'name', 'address'], order: [['name', 'ASC']] });
  res.json({ items: sites });
});

referenceRouter.get('/templates', requireAuth, async (req, res) => {
  const templates = await ChecklistTemplate.findAll({
    where: { active: true },
    attributes: ['id', 'title'],
    include: [{ model: ChecklistItem, as: 'items', attributes: ['id', 'position', 'label', 'type', 'required'] }],
    order: [['id', 'ASC'], [{ model: ChecklistItem, as: 'items' }, 'position', 'ASC']],
  });
  res.json({ items: templates });
});

// Lista inspectorilor, pentru formularul de asignare al coordonatorului.
referenceRouter.get('/users', requireAuth, requireRole(ROLE.COORDINATOR), async (req, res) => {
  const users = await User.findAll({
    where: { role: ROLE.INSPECTOR },
    attributes: ['id', 'name', 'email'],
    order: [['name', 'ASC']],
  });
  res.json({ items: users });
});
