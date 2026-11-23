# Arhitectură

## 1. Vedere de ansamblu

```
┌──────────────── Browser (SPA React + Vite) ────────────────┐
│  UI (React)                                                 │
│   │                                                         │
│   ▼                                                         │
│  Strat de date local ── IndexedDB: inspecții, șabloane,     │
│   │                     coadă de operații nesincronizate     │
│   ▼                                                         │
│  Motor de sincronizare ── trimite coada când e online,      │
│   │                       retry cu backoff, opId unic         │
│  Service worker ── servește aplicația din cache offline     │
└───┼─────────────────────────────────────────────────────────┘
    │ HTTP/JSON (REST), token JWT
    ▼
┌──────────────── Server Node.js + Express ───────────────────┐
│  Rute → autentificare/autorizare → validare → domeniu        │
│  (mașina de stări, regula de conflict, idempotență)          │
│  Sequelize ──► SQLite                                         │
│  Livrare externă (outbox) ──► Registru extern (simulator)    │
└──────────────────────────────────────────────────────────────┘
```

Tehnologii impuse de specificația generală: JavaScript (module ES, fără TypeScript), Node.js + Express, React + Vite, Sequelize + SQLite.

## 2. Model de date

| Entitate | Câmpuri principale | Constrângeri |
|---|---|---|
| `User` | email, name, passwordHash, role (`inspector`/`coordinator`) | email unic |
| `Site` | name, address | — |
| `ChecklistTemplate` | title, active | — |
| `ChecklistItem` | templateId, position, label, type (`yes_no`/`text`/`number`), required | FK template; `(templateId, position)` unic |
| `Inspection` | **id (UUID generat de client)**, templateId, siteId, inspectorId, createdById, status, **version**, dueDate, notes, decisionComment, submittedAt, decidedAt | FK-uri obligatorii; status din enumerare |
| `Answer` | inspectionId, itemId, value | `(inspectionId, itemId)` unic |
| `SyncOperation` | **opId (UUID, cheie primară)**, userId, type, statusCode, response | cheia primară împiedică aplicarea dublă |
| `ExternalDelivery` | inspectionId, idempotencyKey, state (`PENDING`/`SENT`/`FAILED`), attempts, lastError, externalRef, nextAttemptAt | o livrare per inspecție; cheie de idempotență unică |

Relații: un șablon are mai multe întrebări; o inspecție aparține unui șablon, unei locații și unui inspector și are mai multe răspunsuri; o inspecție aprobată are o livrare externă.

## 3. API (proiectat în M1, implementat în M2)

Toate rutele (cu excepția login și health) cer `Authorization: Bearer <token>`.

| Metodă | Rută | Rol | Descriere |
|---|---|---|---|
| GET | `/api/health` | — | Starea serverului |
| POST | `/api/auth/login` | — | Email + parolă → token JWT |
| GET | `/api/auth/me` | ambele | Utilizatorul curent |
| GET | `/api/sites`, `/api/templates` | ambele | Date de referință (descărcate pentru offline) |
| GET | `/api/inspections?status=&siteId=&inspectorId=&sort=&page=&pageSize=` | ambele | Listă cu filtrare, ordonare, paginare; inspectorul vede doar ale lui |
| GET | `/api/inspections/:id` | ambele | Detaliu cu răspunsuri; 404 dacă e a altui inspector |
| POST | `/api/inspections` | ambele | Coordonator: asignare. Inspector: inspecție neplanificată. ID-ul vine de la client |
| PUT | `/api/inspections/:id/answers` | inspector | `{ baseVersion, answers[] }`; 409 la conflict |
| POST | `/api/inspections/:id/transitions` | după acțiune | `{ action, baseVersion, comment? }` |
| POST | `/api/sync` | inspector | Lot de operații `{ operations: [{ opId, type, inspectionId, baseVersion, payload }] }` → rezultat per operație |
| GET | `/api/reports/summary` | coordonator | Agregări pe stare, locație, neconformități |
| POST/GET | `/api/dev/faults` | doar în dezvoltare/test | Configurarea simulatorului de defecte (pachet EXT) |

Format unic de eroare: `{ "error": { "code": "INVALID_TRANSITION", "message": "..." } }`. Coduri HTTP: 400 validare, 401 neautentificat, 403 rol greșit, 404 inexistent sau al altcuiva, 409 conflict de versiune / tranziție invalidă.

## 4. Securitate (bază)
- Parole: bcrypt. Token JWT semnat cu `JWT_SECRET` din `.env`; expirare configurabilă.
- Tokenul e păstrat în browser (necesar ca aplicația să meargă offline după reload); compromisul e documentat în ADR.
- CORS: doar originea frontend-ului (`CLIENT_ORIGIN`).
- Autorizare pe fiecare obiect: interogările inspectorului sunt filtrate întotdeauna după `inspectorId`.
- Sequelize folosește interogări parametrizate; răspunsurile nu conțin `passwordHash`; erorile interne nu expun detalii.

## 5. Structura codului

```
server/src/
  config.js, db.js, app.js, index.js, seed.js
  models/            modelul Sequelize
  domain/            reguli de business (mașina de stări, conflicte)
  routes/            rute Express
server/tests/        teste Vitest + Supertest
client/src/          SPA React
docs/                documentație
```
