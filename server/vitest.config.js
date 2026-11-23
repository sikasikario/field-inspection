import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test', JWT_SECRET: 'test-secret' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.js'],
      // Excluderi justificate: punctele de pornire (server, simulator) și scriptul de seed nu conțin logică de business.
      exclude: ['src/index.js', 'src/seed.js', 'src/external/runRegistry.js'],
      thresholds: { statements: 70, branches: 60 },
    },
  },
});
