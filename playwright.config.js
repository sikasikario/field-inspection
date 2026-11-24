// Teste end-to-end în browser (Playwright). Rulare: npm run e2e
// Pornește automat serverul în mod producție (cu frontend-ul construit) pe o bază de date separată.
import { defineConfig } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1, // testele împart aceeași bază de date
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    // Pe un calculator fără browserul Playwright descărcat se poate folosi Chrome-ul instalat:
    // PW_CHROME_PATH=/cale/catre/chrome npm run e2e
    launchOptions: process.env.PW_CHROME_PATH ? { executablePath: process.env.PW_CHROME_PATH } : {},
  },
  webServer: {
    command: 'npm run build && npm run e2e:server --workspace server',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(PORT), NODE_ENV: 'production', JWT_SECRET: 'e2e-secret', DB_STORAGE: 'data/e2e.sqlite', REGISTRY_URL: 'http://localhost:4999' },
  },
});
