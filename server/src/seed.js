// Date sintetice reproductibile: aceeași rulare produce mereu aceleași date.
// Rulare: npm run seed (șterge și recreează baza de date).
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  sequelize, User, Site, ChecklistTemplate, ChecklistItem, Inspection, Answer,
} from './models/index.js';
import { STATUS, ROLE } from './domain/inspectionStateMachine.js';

export const SEED_PASSWORD = 'parola123';
const INSPECTION_COUNT = 36; // tema cere minimum 30

// Generator pseudo-aleator cu sămânță fixă (mulberry32), pentru date reproductibile.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seed() {
  const rand = rng(42);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  await sequelize.sync({ force: true });
  // În teste folosim un cost bcrypt mic, ca seed-ul repetat să fie rapid.
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, process.env.NODE_ENV === 'test' ? 4 : 10);

  const coordinator = await User.create({
    email: 'coordonator@demo.ro', name: 'Ana Coordonator', role: ROLE.COORDINATOR, passwordHash,
  });
  const inspectors = await User.bulkCreate(
    ['ion', 'maria', 'andrei'].map((n) => ({
      email: `${n}@demo.ro`,
      name: `${n[0].toUpperCase()}${n.slice(1)} Inspector`,
      role: ROLE.INSPECTOR,
      passwordHash,
    })),
  );

  const sites = await Site.bulkCreate([
    { name: 'Depozit Militari', address: 'Bd. Iuliu Maniu 220, București' },
    { name: 'Fabrica Pipera', address: 'Str. Fabrica de Glucoză 5, Voluntari' },
    { name: 'Clădire birouri Unirii', address: 'Bd. Unirii 15, București' },
    { name: 'Hală logistică Chitila', address: 'Șos. Chitilei 300, Chitila' },
    { name: 'Magazin Berceni', address: 'Str. Turnu Măgurele 10, București' },
  ]);

  const templates = [
    {
      title: 'Verificare PSI (prevenirea incendiilor)',
      items: [
        ['Stingătoarele sunt în termen de valabilitate?', 'yes_no'],
        ['Căile de evacuare sunt libere?', 'yes_no'],
        ['Iluminatul de siguranță funcționează?', 'yes_no'],
        ['Număr de stingătoare verificate', 'number'],
        ['Observații', 'text', false],
      ],
    },
    {
      title: 'Inspecție instalație electrică',
      items: [
        ['Tablourile electrice sunt închise și etichetate?', 'yes_no'],
        ['Există cabluri deteriorate?', 'yes_no'],
        ['Priza de împământare a fost testată?', 'yes_no'],
        ['Observații', 'text', false],
      ],
    },
  ];

  const createdTemplates = [];
  for (const t of templates) {
    const template = await ChecklistTemplate.create({ title: t.title });
    const items = await ChecklistItem.bulkCreate(
      t.items.map(([label, type, req = true], i) => ({
        templateId: template.id, position: i + 1, label, type, required: req,
      })),
    );
    createdTemplates.push({ template, items });
  }

  const statuses = Object.values(STATUS);
  for (let i = 0; i < INSPECTION_COUNT; i++) {
    const { template, items } = pick(createdTemplates);
    const status = statuses[i % statuses.length];
    const due = new Date(Date.UTC(2026, 11, 1 + (i % 28)));
    const inspection = await Inspection.create({
      id: randomUUID(),
      templateId: template.id,
      siteId: pick(sites).id,
      inspectorId: inspectors[i % inspectors.length].id,
      createdById: coordinator.id,
      status,
      dueDate: due.toISOString().slice(0, 10),
      submittedAt: [STATUS.SUBMITTED, STATUS.APPROVED, STATUS.REJECTED].includes(status) ? due : null,
      decidedAt: [STATUS.APPROVED, STATUS.REJECTED].includes(status) ? due : null,
      decisionComment: status === STATUS.REJECTED ? 'Lipsesc detalii la observații.' : null,
    });

    if (status !== STATUS.ASSIGNED) {
      // IN_PROGRESS: doar o parte din răspunsuri; celelalte stări: toate.
      const answered = status === STATUS.IN_PROGRESS ? items.slice(0, 2) : items;
      await Answer.bulkCreate(
        answered.map((item) => ({
          inspectionId: inspection.id,
          itemId: item.id,
          value: item.type === 'yes_no' ? pick(['da', 'nu']) : item.type === 'number' ? String(1 + Math.floor(rand() * 10)) : 'Fără probleme majore.',
        })),
      );
    }
  }

  return { coordinator, inspectors, sites, inspections: INSPECTION_COUNT };
}

// Rulat direct din linia de comandă (nu la import din teste).
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await seed();
  console.log(`Seed gata: 1 coordonator, ${result.inspectors.length} inspectori, ${result.sites.length} locații, ${result.inspections} inspecții.`);
  console.log(`Parola pentru toate conturile demo: ${SEED_PASSWORD}`);
  await sequelize.close();
}
