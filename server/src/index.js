import { createApp } from './app.js';
import { config } from './config.js';
import { sequelize } from './models/index.js';

await sequelize.sync();

createApp().listen(config.port, () => {
  console.log(`API pornit pe http://localhost:${config.port} (${config.env})`);
});
