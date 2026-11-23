// Configurația aplicației, citită din variabilele de mediu (vezi .env.example).
const env = process.env.NODE_ENV ?? 'development';

if (env === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET trebuie setat în producție');
}

export const config = {
  env,
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret',
  // Token valabil 7 zile: inspectorul poate lucra offline mai multe zile și sincroniza după.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  // În teste folosim o bază de date în memorie, ca fiecare rulare să pornească de la zero.
  dbStorage: env === 'test' ? ':memory:' : (process.env.DB_STORAGE ?? 'data/app.sqlite'),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  // Pachetul EXT: registrul extern (simulat local) și parametrii de livrare.
  registryUrl: process.env.REGISTRY_URL ?? 'http://localhost:4000',
  delivery: {
    timeoutMs: Number(process.env.DELIVERY_TIMEOUT_MS ?? 3000),
    maxAttempts: Number(process.env.DELIVERY_MAX_ATTEMPTS ?? 5),
    baseDelayMs: Number(process.env.DELIVERY_BASE_DELAY_MS ?? 1000),
    maxDelayMs: Number(process.env.DELIVERY_MAX_DELAY_MS ?? 60000),
    pollIntervalMs: Number(process.env.DELIVERY_POLL_MS ?? 2000),
  },
};
