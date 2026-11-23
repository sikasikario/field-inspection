// Pornește simulatorul registrului extern: npm run registry
import { createRegistrySimulator } from './registrySimulator.js';

const port = Number(process.env.REGISTRY_PORT ?? 4000);
const sim = createRegistrySimulator({ hangMs: Number(process.env.REGISTRY_HANG_MS ?? 10000) });
sim.app.listen(port, () => {
  console.log(`Registru extern simulat pe http://localhost:${port}`);
  console.log('Defecte: POST /__control/faults {"faults":["timeout","error","ok"]} · stare: GET /__control/state');
});
