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

## Jurnal de observații
- **M2:** testul cu 5 retransmisii paralele ale aceleiași operații a fost scris special pentru a verifica dacă idempotența ține și la cereri simultane, nu doar succesive (SQLite are un singur scriitor; tranzacțiile sunt serializate în proces).
- **M1:** `npm audit` a semnalat o vulnerabilitate moderată în pachetul `uuid` folosit intern de Sequelize. Rezolvat prin `overrides` în `package.json` (forțează `uuid@^11.1.1`), verificat cu `npm ls uuid`, `npm audit` (0 vulnerabilități) și rularea testelor.
