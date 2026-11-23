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

## 3. API (implementat în M2)

Toate rutele (cu excepția login și health) cer `Authorization: Bearer <token>`.

| Metodă | Rută | Rol | Descriere |
|---|---|---|---|
| GET | `/api/health` | — | Starea serverului |
| POST | `/api/auth/login` | — | Email + parolă → token JWT |
| GET | `/api/auth/me` | ambele | Utilizatorul curent |
| GET | `/api/sites`, `/api/templates` | ambele | Date de referință (descărcate pentru offline) |
| GET | `/api/users` | coordonator | Lista inspectorilor (pentru asignare) |
| GET | `/api/inspections?status=&siteId=&inspectorId=&sort=&page=&pageSize=` | ambele | Listă cu filtrare, ordonare, paginare; inspectorul vede doar ale lui |
| GET | `/api/inspections/:id` | ambele | Detaliu cu răspunsuri; 404 dacă e a altui inspector |
| POST | `/api/inspections` | ambele | Coordonator: asignare. Inspector: inspecție neplanificată. ID-ul vine de la client |
| PUT | `/api/inspections/:id/answers` | inspector | `{ baseVersion, answers[] }`; 409 la conflict |
| POST | `/api/inspections/:id/transitions` | după acțiune | `{ action, baseVersion, comment? }` |
| POST | `/api/sync` | inspector | Lot de operații `{ operations: [{ opId, type, inspectionId, baseVersion, payload }] }` → rezultat per operație |
| GET | `/api/sync/pull?since=` | ambele | Inspecțiile vizibile modificate de la ultima sincronizare (cu răspunsuri) |
| GET | `/api/reports/summary` | coordonator | Agregări pe stare, locație, neconformități |
| GET | `/api/deliveries` | coordonator | Starea livrărilor către registrul extern |
| POST | `/api/deliveries/:id/retry` | coordonator | Reluarea manuală a unei livrări `FAILED` |

Registrul extern simulat (proces separat, `npm run registry`, port 4000):
`POST /registry/inspections` (cere `Idempotency-Key`), `POST /__control/faults`, `POST /__control/reset`, `GET /__control/state`.

Format unic de eroare: `{ "error": { "code": "INVALID_TRANSITION", "message": "..." } }`. Coduri HTTP: 400 validare, 401 neautentificat, 403 rol greșit, 404 inexistent sau al altcuiva, 409 conflict de versiune / tranziție invalidă / inspecție needitabilă, 422 inspecție incompletă la trimitere.

## 4. Securitate (bază)
- Parole: bcrypt. Token JWT semnat cu `JWT_SECRET` din `.env`; expirare configurabilă.
- Tokenul e păstrat în browser (necesar ca aplicația să meargă offline după reload); compromisul e documentat în ADR.
- CORS: doar originea frontend-ului (`CLIENT_ORIGIN`).
- Autorizare pe fiecare obiect: interogările inspectorului sunt filtrate întotdeauna după `inspectorId`.
- Sequelize folosește interogări parametrizate; răspunsurile nu conțin `passwordHash`; erorile interne nu expun detalii.

## 5. Decizii de implementare (M2)
- **Strat de servicii.** Regulile (creare, răspunsuri, tranziții) sunt în `services/inspectionService.js` și sunt folosite atât de rutele REST, cât și de `/api/sync`. O regulă există într-un singur loc.
- **Verificarea versiunii e atomică.** Actualizarea se face cu `UPDATE ... WHERE id = ? AND version = ?`; dacă între timp altcineva a schimbat inspecția, nu se modifică niciun rând și răspundem 409. Protecția e în baza de date, nu doar în cod.
- **Un singur scriitor.** SQLite permite o singură tranzacție de scriere odată. Tranzacțiile de scriere sunt puse la coadă în proces (`withWriteTransaction` din `db.js`), iar baza rulează în modul WAL (cititorii nu sunt blocați). Limită: la mai multe instanțe de server ar fi nevoie de un SGBD client-server (PostgreSQL).
- **Idempotența sincronizării.** Rezultatul fiecărei operații e salvat în `SyncOperation` în aceeași tranzacție cu modificarea. Ori se salvează amândouă, ori niciuna. Erorile 5xx nu se salvează (clientul poate reîncerca); erorile 4xx da (retransmiterea primește același răspuns).
- **Outbox pentru EXT.** Aprobarea creează o livrare `PENDING` în aceeași tranzacție; un worker din proces o trimite. Livrările sunt în baza de date, deci supraviețuiesc unui restart.

## 6. Structura codului

```
server/src/
  config.js, db.js, app.js, index.js, seed.js
  models/            modelul Sequelize
  domain/            mașina de stări
  services/          reguli de business: inspecții, sincronizare, rapoarte, livrare externă
  external/          clientul și simulatorul registrului extern
  routes/            rute Express (subțiri, apelează serviciile)
  auth.js, errors.js, validation.js
server/tests/        teste Vitest + Supertest
client/src/          SPA React
docs/                documentație
```
