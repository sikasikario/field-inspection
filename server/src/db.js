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
