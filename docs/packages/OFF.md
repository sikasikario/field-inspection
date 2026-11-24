# Pachet OFF — Funcționare offline și sincronizare

**Cerință:** acțiunile inspectorului (completare, creare inspecție neplanificată, trimitere) funcționează fără rețea și se sincronizează ulterior.
**Verificare obligatorie:** mod avion, reîncărcare pagină, revenire online, retransmisii duplicate, conflict. Tema cere minimum 10 minute offline cu reîncărcare.

## Alternative analizate (M1)

### 1. Unde păstrăm datele local
| Variantă | Pro | Contra |
|---|---|---|
| `localStorage` | Foarte simplu | Doar text, ~5 MB, sincron (blochează UI-ul), nepotrivit pentru poze |
| **IndexedDB** (cu biblioteca mică `idb`) | Obiecte structurate, volum mare, asincron, potrivit și pentru poze | API mai complicat |
| Cache API | Bun pentru fișiere/răspunsuri HTTP | Nepotrivit pentru date editabile |

**Alegere propusă:** IndexedDB pentru date + coadă de operații.

### 2. Cum pornește aplicația după reload fără rețea
| Variantă | Pro | Contra |
|---|---|---|
| Fără service worker | Simplu | După reload offline, browserul nu poate încărca pagina deloc |
| **Service worker scris manual** (cache pentru fișierele aplicației) | Control total, ușor de explicat | Trebuie gestionată versiunea cache-ului |
| Plugin `vite-plugin-pwa` (Workbox) | Generat automat | Mai greu de explicat ce face exact |

**Alegere propusă:** service worker mic, scris manual, cu strategie „cache first” pentru fișierele aplicației și fără cache pentru `/api`.

### 3. Cum sincronizăm
| Variantă | Pro | Contra |
|---|---|---|
| Trimitem toată inspecția la fiecare modificare | Simplu | Mai multe conflicte, mai mult trafic |
| **Coadă de operații (outbox) în IndexedDB**, fiecare cu `opId` UUID | Ordine păstrată, retransmitere sigură, idempotentă | Cod suplimentar pentru coadă |
| Background Sync API | Rulează și cu tab-ul închis | Nu e suportat în Safari/Firefox |

**Alegere propusă:** coadă de operații, golită la evenimentul `online`, la pornirea aplicației și periodic; retry cu backoff exponențial.

### 4. Politica de conflicte
Un conflict apare când inspecția s-a schimbat pe server după ce inspectorul a descărcat-o (alt dispozitiv sau decizie a coordonatorului).

| Variantă | Pro | Contra |
|---|---|---|
| Last-write-wins | Simplu | Pierde date fără avertisment |
| **Versiune + refuz explicit (409), alegere în UI** | Nicio pierdere silențioasă, ușor de testat | Utilizatorul trebuie să aleagă |
| Unire automată pe câmp (opțional, extensie) | Mai puține conflicte vizibile | Mai complex |

**Politica aleasă:**
1. Fiecare modificare trimite `baseVersion` (versiunea de la care a pornit editarea).
2. Dacă `baseVersion` ≠ versiunea de pe server → `409 Conflict`, cu varianta de pe server în răspuns.
3. Dacă inspecția a ajuns între timp într-o stare needitabilă (`SUBMITTED`, `APPROVED`) → **serverul câștigă**; copia locală e păstrată ca „conflict” doar pentru consultare.
4. Altfel, utilizatorul alege: „păstrez varianta mea” (retrimite cu versiunea nouă) sau „folosesc varianta serverului”.

## Plan de verificare (M2–M3)
- Test de integrare: aceeași operație trimisă de 3 ori → o singură inspecție, aceleași răspunsuri, același rezultat.
- Test de integrare: `baseVersion` vechi → 409; inspecție aprobată → modificarea refuzată.
- Test E2E (Playwright): context offline → completare → reload → 10 minute (timp simulat) → online → verificare în baza de date.
- Demonstrație manuală: DevTools → Network → Offline (sau mod avion).

## Limite (de completat în ADR)
- Datele locale nu sunt criptate pe dispozitiv.
- Dacă utilizatorul șterge datele browserului înainte de sincronizare, modificările se pierd.

## Stadiu M2: partea de server, implementată și verificată
- `POST /api/sync` primește loturi de operații (`create`, `saveAnswers`, `transition`), fiecare cu `opId`. Rezultatul e salvat în `SyncOperation`; o retransmitere primește rezultatul salvat (`replayed: true`).
- `GET /api/sync/pull?since=` aduce doar inspecțiile modificate de la ultima sincronizare.
- Conflictele sunt raportate per operație (409 `VERSION_CONFLICT` / `NOT_EDITABLE`, cu varianta serverului), iar restul lotului continuă.
- Teste în `server/tests/sync.test.js`: lot offline complet, lot retransmis de 3 ori (o singură aplicare), **aceeași operație trimisă de 5 ori în paralel** (aplicată o dată), conflict de versiune, aprobare între timp, `opId` furat de alt utilizator, operații invalide, pull incremental.


## Stadiu M3: partea de client, implementată și verificată în browser
- IndexedDB: `client/src/lib/db.js`; motor de sincronizare și coadă: `client/src/lib/syncEngine.js`; service worker: `client/public/sw.js`.
- Teste E2E (`e2e/offline.spec.js`, Chrome real prin Playwright):

| Scenariu | Ce se verifică |
|---|---|
| Mod avion + reload + perioadă lungă offline | răspunsurile și trimiterea făcute offline supraviețuiesc reîncărcării; motorul reîncearcă de mai multe ori fără să piardă nimic; la revenire, inspecția apare pe server `SUBMITTED`, cu toate răspunsurile, fără inspecții dublate |
| Retransmisii duplicate (simulator) | crearea ajunge de 3 ori la server (răspuns pierdut + cerere dublă), dar există exact o inspecție nouă |
| Conflict | modificare offline + modificare de pe alt dispozitiv → banner cu diferența → „Păstrează varianta mea” → pe server rămâne varianta locală, versiunea a crescut corect |

- Perioada offline: implicit 20 s (rulare rapidă). Scenariul de **10 minute** din fișa temei: `E2E_OFFLINE_MS=600000 npm run e2e` (verificat, vezi `docs/testing.md`).

## Limite
- Datele locale nu sunt criptate pe dispozitiv; cine are acces la browserul deblocat le poate citi.
- Dacă utilizatorul șterge datele browserului înainte de sincronizare, modificările nesincronizate se pierd.
- O inspecție reasignată altui inspector rămâne în baza locală a primului până la deconectare (pull-ul aduce doar inspecțiile vizibile, nu și ștergerile).
- Un token expirat oprește sincronizarea până la o nouă autentificare; coada rămâne intactă.
- Service worker-ul și reload-ul offline funcționează în build-ul de producție (`npm run build && npm start`), nu în `npm run dev`.
