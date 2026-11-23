// Configurația aplicației, citită din variabilele de mediu (vezi .env.example).
const env = process.env.NODE_ENV ?? 'development';

if (env === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET trebuie setat în producție');
}

export const config = {
  env,
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret',
  // În teste folosim o bază de date în memorie, ca fiecare rulare să pornească de la zero.
  dbStorage: env === 'test' ? ':memory:' : (process.env.DB_STORAGE ?? 'data/app.sqlite'),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
};
