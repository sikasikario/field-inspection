# Utilizarea instrumentelor AI

## Instrumente
- **Claude (Anthropic)**: asistent pentru analiză, proiectare, generare de cod, teste și documentație.

## Mod de lucru
1. Formulez cerința pe baza fișei temei și a specificației generale.
2. Agentul propune cod sau documentație.
3. Inspectez modificările, rulez testele și verific comportamentul în aplicație.
4. Corectez sau cer corecturi când găsesc probleme.

## Caz tehnic semnificativ: erorile mașinii de stări deveneau „500 Eroare internă”
- **Cerință:** o tranziție nepermisă (de exemplu, trimiterea de două ori a aceleiași inspecții sau respingerea fără comentariu) trebuie să primească un răspuns clar: 409 sau 400, cu codul erorii.
- **Intervenția agentului:** agentul a scris mașina de stări cu o clasă proprie de eroare (`TransitionError`) și un handler central care transformă erorile în răspunsuri HTTP, recunoscând `TransitionError` după proprietatea `err.name`.
- **Inspecție / verificare:** testele unitare ale mașinii de stări treceau. Testele de integrare (`inspections.test.js`) au arătat însă că API-ul răspundea **500** în loc de 400/409 la trei scenarii.
- **Defect:** clasa `TransitionError extends Error` nu seta `this.name`, deci `err.name` era `"Error"`, iar handler-ul nu o recunoștea și o trata ca eroare internă. Testele unitare nu au prins problema pentru că verificau doar `err.code`, nu traseul până la răspunsul HTTP.
- **Remediere:** `this.name = 'TransitionError'` în constructor.
- **Rezultat:** cele 3 teste de integrare trec. Concluzie: testele unitare singure nu ajung; e nevoie și de teste care verifică răspunsul HTTP complet.

## Al doilea caz: aplicația nu pornea offline după reload
- **Cerință:** după un reload fără rețea, aplicația trebuie să se încarce din cache-ul service worker-ului.
- **Intervenția agentului:** service worker cu strategie „cache first” pentru fișierele statice.
- **Verificare:** testul E2E a arătat o pagină goală offline, deși fișierele JS și CSS erau în cache (verificat cu `caches.keys()`).
- **Defect:** serverul trimite `Vary: Origin` (de la middleware-ul CORS), iar scripturile de tip modul sunt cerute cu header-ul `Origin`. `caches.match()` respectă `Vary`, deci nu găsea fișierele salvate fără acel header.
- **Remediere:** `caches.match(request, { ignoreVary: true })`.
- **Rezultat:** reload-ul offline funcționează; testul E2E trece.

## Al treilea caz: scriptul de seed nu făcea nimic pe calculatorul meu
- **Simptom:** după `npm run seed`, autentificarea eșua cu „Email sau parolă greșite”. Baza de date avea tabelele, dar niciun utilizator.
- **Cauză:** scriptul verifica dacă e rulat direct comparând `import.meta.url` cu `file://` + calea fișierului. Folderul proiectului are spații în nume („proiect Tehnologii Web”), iar în URL spațiile devin `%20`, deci comparația era mereu falsă și seed-ul se oprea fără nicio eroare. Pe calculatorul agentului (cale fără spații) problema nu apărea.
- **Remediere:** comparația folosește `pathToFileURL(process.argv[1]).href`, care codifică la fel calea.
- **Lecție:** testele automate rulau seed-ul prin import, nu din linia de comandă, deci nu puteau prinde problema. A fost găsită doar rulând proiectul pe alt calculator.

## Jurnal de observații
- **M3:** testele E2E au fost instabile la început din cauza unor curse în teste (testul completa formularul înainte ca pagina să se încarce; reîncărca pagina înainte ca IndexedDB să termine scrierea). Corectate prin așteptări explicite (pagina încărcată, răspunsurile scrise local), apoi verificate prin 6 rulări consecutive.
- **M3:** `page.clock` (timp simulat în Playwright) împiedica încărcarea scripturilor din service worker; scenariul de 10 minute offline folosește timp real, configurabil prin `E2E_OFFLINE_MS`.
- **M2:** testul cu 5 retransmisii paralele ale aceleiași operații a fost scris special pentru a verifica dacă idempotența ține și la cereri simultane, nu doar succesive (SQLite are un singur scriitor; tranzacțiile sunt serializate în proces).
- **M1:** `npm audit` a semnalat o vulnerabilitate moderată în pachetul `uuid` folosit intern de Sequelize. Rezolvat prin `overrides` în `package.json` (forțează `uuid@^11.1.1`), verificat cu `npm ls uuid`, `npm audit` (0 vulnerabilități) și rularea testelor.
