// Raport central pentru coordonator. Interogările nu primesc date de la utilizator.
import { QueryTypes } from 'sequelize';
import { sequelize } from '../db.js';
import { STATUS } from '../domain/inspectionStateMachine.js';

export async function summary() {
  const byStatusRows = await sequelize.query(
    'SELECT status, COUNT(*) AS count FROM Inspections GROUP BY status',
    { type: QueryTypes.SELECT },
  );
  const byStatus = Object.fromEntries(Object.values(STATUS).map((s) => [s, 0]));
  for (const r of byStatusRows) byStatus[r.status] = Number(r.count);

  const bySite = await sequelize.query(
    `SELECT s.id AS siteId, s.name AS siteName,
            COUNT(DISTINCT i.id) AS inspections,
            SUM(CASE WHEN ci.type = 'yes_no' AND a.value = 'nu' THEN 1 ELSE 0 END) AS nonConformities
       FROM Sites s
       LEFT JOIN Inspections i ON i.siteId = s.id
       LEFT JOIN Answers a ON a.inspectionId = i.id
       LEFT JOIN ChecklistItems ci ON ci.id = a.itemId
      GROUP BY s.id, s.name
      ORDER BY s.name`,
    { type: QueryTypes.SELECT },
  );

  return {
    total: Object.values(byStatus).reduce((x, y) => x + y, 0),
    byStatus,
    bySite: bySite.map((r) => ({
      siteId: r.siteId,
      siteName: r.siteName,
      inspections: Number(r.inspections),
      nonConformities: Number(r.nonConformities ?? 0),
    })),
  };
}
