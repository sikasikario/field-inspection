# Plan de testare

Instrumente: **Vitest** (unitare + integrare), **Supertest** (cereri HTTP către API), **@vitest/coverage-v8** (acoperire), **Playwright** (E2E, M3), **k6** (încărcare, M3).

Rulare: `npm test`, `npm run coverage`.

## Niveluri

| Nivel | Ce testăm | Exemple |
|---|---|---|
| Unitare | Reguli de business pure | mașina de stări (deja în M1), regula de conflict, calculul backoff-ului |
| Integrare | API + bază de date | login, liste filtrate/paginate, sincronizare idempotentă, 409 la conflict, livrare externă |
| Negative | Validare și permisiuni | date invalide → 400; fără token → 401; inspector pe rută de coordonator → 403; inspecția altui inspector → 404 |
| Pachete | Scenariile OFF și EXT | vezi `docs/packages/` |
| E2E | Flux complet în browser | offline → completare → reload → online → verificare server |

## Invariante testate explicit
1. Retransmiterea aceleiași operații nu produce duplicate.
2. Modificarea cu versiune veche → 409; inspecția aprobată nu mai poate fi modificată.
3. Un inspector nu poate vedea/modifica inspecțiile altuia (citire, listare, modificare, tranziții).
4. Doar tranzițiile din mașina de stări sunt posibile.

## Acoperire
Praguri: ≥70% statements, ≥60% branches pe codul backend (configurate în `server/vitest.config.js`; rularea eșuează sub prag).
Excluderi justificate: `src/index.js` (doar pornește serverul), `src/seed.js` (date demo), `node_modules`, configurații.

## Stare la M1
- 10 teste: health, format de eroare 404, 8 teste pentru mașina de stări (tranziții valide/invalide, cereri repetate, roluri, proprietar, precondiții).
