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

## Stare la M2
**66 de teste automate, toate trec** (`npm test`, circa 7 secunde).

| Fișier | Ce acoperă |
|---|---|
| `stateMachine.test.js` | unitare: tranziții valide/invalide, cereri repetate, rol, proprietar, precondiții |
| `health.test.js` | health, format de eroare 404 |
| `auth.test.js` | login, credențiale greșite (același mesaj), JSON invalid, token lipsă/fals/expirat, permisiuni pe rol |
| `inspections.test.js` | confidențialitate, filtrare/ordonare/paginare, parametri invalizi, creare idempotentă, validări, conflicte, tranziții, raport |
| `sync.test.js` | pachetul OFF (server): idempotență, retransmisii paralele, conflicte, pull incremental |
| `external.test.js` | pachetul EXT: timeout, 500, 429, eșec permanent, răspuns pierdut/duplicat, retry limitat, backoff |

### Raport de acoperire (M2)

| Metrică | Valoare | Prag |
|---|---|---|
| Statements | 94.4% | ≥70% |
| Branches | 88.6% | ≥60% |
| Functions | 95.4% | — |
| Lines | 95.2% | — |

Raportul HTML se generează cu `npm run coverage` în `server/coverage/index.html`.

### Lacune cunoscute și riscuri
- `startDeliveryWorker` (bucla periodică) nu e testată direct; logica ei (`processDueDeliveries`) e testată complet. Risc mic.
- Concurența e testată pe baza de date în memorie; comportamentul cu fișier SQLite în mod WAL e verificat manual și va fi măsurat în testul de încărcare (M3).
- Frontend-ul nu are încă teste (M3: E2E cu Playwright).
