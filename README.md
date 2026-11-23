# Inspecții de teren offline

Proiect Tehnologii Web 2026–2027, Tema 7 (pachete obligatorii: **OFF** + **EXT**).

Aplicație web în care inspectorii completează checklist-uri pe teren, inclusiv fără internet, iar datele se sincronizează când revine conexiunea. Un coordonator repartizează inspecțiile, le aprobă sau le respinge și vede rapoarte.

**Stack:** Node.js + Express, Sequelize + SQLite, React + Vite, Vitest.

## Cerințe
- Node.js 22 sau mai nou (`node -v`)
- npm (vine cu Node)

## Instalare și pornire

```bash
npm install                     # instalează dependențele pentru server și client
cp .env.example server/.env     # apoi editați JWT_SECRET
npm run seed                    # creează baza de date cu date demo (36 inspecții)
npm run registry                # terminal 1: registrul extern simulat pe http://localhost:4000
npm run dev:server              # terminal 2: API pe http://localhost:3000
npm run dev:client              # terminal 3: aplicația pe http://localhost:5173
```

Registrul extern e opțional pentru pornire: dacă nu rulează, livrările inspecțiilor aprobate rămân `PENDING` și sunt reîncercate automat (asta e chiar comportamentul cerut de pachetul EXT).

Conturi demo (parola pentru toate: `parola123`):
- coordonator: `coordonator@demo.ro`
- inspectori: `ion@demo.ro`, `maria@demo.ro`, `andrei@demo.ro`

## Teste

```bash
npm test          # toate testele backend
npm run coverage  # teste + raport de acoperire (server/coverage/index.html)
```

## Producție (local)

```bash
npm run build     # construiește frontend-ul în client/dist
npm start         # pornește serverul în mod producție
```

## Documentație
- [Cerințe](docs/requirements.md)
- [Arhitectură, model de date, API](docs/architecture.md)
- [Pachet OFF](docs/packages/OFF.md) · [Pachet EXT](docs/packages/EXT.md)
- [Plan de testare](docs/testing.md) · [Capacitate](docs/capacity.md)
- [Decizii arhitecturale](docs/adr/) · [Utilizare AI](docs/ai-usage.md)

## Stadiu
- [x] M1: analiză, design, schelet executabil
- [x] M2: API, persistență, reguli, teste, primul scenariu de pachet (EXT complet pe server, sincronizare idempotentă)
- [ ] M3: SPA completă, pachete validate, E2E, încărcare, ADR, demo
