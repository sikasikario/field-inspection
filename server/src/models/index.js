// Modelul de date (Sequelize). Schema completă e descrisă și în docs/architecture.md.
import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';
import { STATUS, ROLE } from '../domain/inspectionStateMachine.js';

export const User = sequelize.define('User', {
  email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
  name: { type: DataTypes.STRING, allowNull: false },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM(...Object.values(ROLE)), allowNull: false },
});

export const Site = sequelize.define('Site', {
  name: { type: DataTypes.STRING, allowNull: false },
  address: { type: DataTypes.STRING, allowNull: false },
});

export const ChecklistTemplate = sequelize.define('ChecklistTemplate', {
  title: { type: DataTypes.STRING, allowNull: false },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
});

export const ChecklistItem = sequelize.define(
  'ChecklistItem',
  {
    position: { type: DataTypes.INTEGER, allowNull: false },
    label: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.ENUM('yes_no', 'text', 'number'), allowNull: false },
    required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { indexes: [{ unique: true, fields: ['templateId', 'position'] }] },
);

export const Inspection = sequelize.define(
  'Inspection',
  {
    // ID-ul e un UUID generat pe client: o inspecție creată offline are deja
    // identitatea finală, iar retransmiterea ei nu poate crea un duplicat.
    id: { type: DataTypes.UUID, primaryKey: true },
    status: {
      type: DataTypes.ENUM(...Object.values(STATUS)),
      allowNull: false,
      defaultValue: STATUS.ASSIGNED,
    },
    // Crește la fiecare modificare; folosit pentru detectarea conflictelor (optimistic locking).
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    dueDate: { type: DataTypes.DATEONLY },
    notes: { type: DataTypes.TEXT },
    decisionComment: { type: DataTypes.TEXT },
    submittedAt: { type: DataTypes.DATE },
    decidedAt: { type: DataTypes.DATE },
  },
  { indexes: [{ fields: ['inspectorId', 'status'] }, { fields: ['siteId'] }] },
);

export const Answer = sequelize.define(
  'Answer',
  { value: { type: DataTypes.TEXT } },
  { indexes: [{ unique: true, fields: ['inspectionId', 'itemId'] }] },
);

// Jurnal de idempotență: fiecare operație trimisă de client are un opId unic.
// Dacă aceeași operație sosește din nou, serverul întoarce rezultatul salvat, fără a o reaplica.
export const SyncOperation = sequelize.define('SyncOperation', {
  opId: { type: DataTypes.UUID, primaryKey: true },
  type: { type: DataTypes.STRING, allowNull: false },
  statusCode: { type: DataTypes.INTEGER, allowNull: false },
  response: { type: DataTypes.JSON, allowNull: false },
});

// Pachetul EXT: livrarea inspecțiilor aprobate către registrul extern (simulat).
export const ExternalDelivery = sequelize.define('ExternalDelivery', {
  idempotencyKey: { type: DataTypes.UUID, allowNull: false, unique: true },
  state: {
    type: DataTypes.ENUM('PENDING', 'SENT', 'FAILED'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lastError: { type: DataTypes.STRING },
  externalRef: { type: DataTypes.STRING },
  nextAttemptAt: { type: DataTypes.DATE },
});

// Relații (chei străine cu constrângeri de integritate)
const required = { allowNull: false };

ChecklistTemplate.hasMany(ChecklistItem, { foreignKey: { name: 'templateId', ...required }, as: 'items' });
ChecklistItem.belongsTo(ChecklistTemplate, { foreignKey: 'templateId' });

Inspection.belongsTo(ChecklistTemplate, { foreignKey: { name: 'templateId', ...required }, as: 'template' });
Inspection.belongsTo(Site, { foreignKey: { name: 'siteId', ...required }, as: 'site' });
Inspection.belongsTo(User, { foreignKey: { name: 'inspectorId', ...required }, as: 'inspector' });
Inspection.belongsTo(User, { foreignKey: { name: 'createdById', ...required }, as: 'createdBy' });

Inspection.hasMany(Answer, { foreignKey: { name: 'inspectionId', ...required }, as: 'answers', onDelete: 'CASCADE' });
Answer.belongsTo(Inspection, { foreignKey: 'inspectionId' });
Answer.belongsTo(ChecklistItem, { foreignKey: { name: 'itemId', ...required }, as: 'item' });

SyncOperation.belongsTo(User, { foreignKey: { name: 'userId', ...required } });

Inspection.hasOne(ExternalDelivery, { foreignKey: { name: 'inspectionId', ...required, unique: true } });
ExternalDelivery.belongsTo(Inspection, { foreignKey: 'inspectionId' });

export { sequelize };
