import { createApp } from './app.js';
import { config } from './config.js';
import { sequelize } from './models/index.js';
import { startDeliveryWorker } from './services/deliveryService.js';

await sequelize.sync();
if (config.dbStorage !== ':memory:') {
  // WAL: cititorii nu mai sunt blocați de scriitor; busy_timeout: așteaptă în loc să eșueze imediat.
  await sequelize.query('PRAGMA journal_mode = WAL');
  await sequelize.query('PRAGMA busy_timeout = 5000');
}

startDeliveryWorker();

createApp().listen(config.port, () => {
  console.log(`API pornit pe http://localhost:${config.port} (${config.env})`);
  console.log(`Registrul extern așteptat la ${config.registryUrl} (pornire: npm run registry)`);
});
