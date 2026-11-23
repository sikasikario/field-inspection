import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Sequelize } from 'sequelize';
import { config } from './config.js';

if (config.dbStorage !== ':memory:') {
  mkdirSync(dirname(config.dbStorage), { recursive: true });
}

export const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: config.dbStorage,
  logging: false,
});

// SQLite acceptă un singur scriitor la un moment dat. În loc să lăsăm cererile concurente
// să se lovească de „database is locked”, le punem la coadă în proces: fiecare tranzacție
// de scriere așteaptă să se termine cea dinainte. (Decizie documentată în docs/architecture.md.)
let writeQueue = Promise.resolve();

export function withWriteTransaction(fn) {
  const run = writeQueue.then(() => sequelize.transaction(fn));
  // Coada continuă și dacă o tranzacție eșuează.
  writeQueue = run.catch(() => {});
  return run;
}
