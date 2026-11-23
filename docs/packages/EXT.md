# Pachet EXT — Integrare externă rezilientă

**Cerință:** serviciu extern sau simulator cu timeout, eroare, rate limit și răspuns duplicat.
**Verificare obligatorie:** teste deterministe de eroare, retry limitat, stări coerente, efecte idempotente. Fișa temei cere explicit un **simulator de rețea cu timeout și răspunsuri duplicate**.

## Ce integrăm
1. **Registrul extern de inspecții (simulat).** Când coordonatorul aprobă o inspecție, serverul o raportează unui „registru național” extern. Registrul e un mic serviciu local (cost zero), care poate fi configurat să răspundă normal, lent (timeout), cu eroare 500, cu 429 (rate limit) sau de două ori.
2. **Simulator de rețea între client și server.** Un strat în motorul de sincronizare al clientului (activ doar în dezvoltare/teste) care poate pierde răspunsuri, întârzia cereri sau retrimite aceeași cerere. Așa demonstrăm că sincronizarea OFF rezistă la rețea proastă.

## Alternative analizate (M1)

| Decizie | Variante | Alegere propusă și motiv |
|---|---|---|
| Unde rulează apelul extern | (a) direct în cererea de aprobare; (b) **outbox**: aprobarea salvează o livrare `PENDING`, un worker din proces o trimite | (b): aprobarea nu depinde de disponibilitatea registrului; starea livrării e vizibilă |
| Timeout | fără timeout / **timeout fix (ex. 3 s) cu `AbortController`** | Timeout fix: o cerere blocată nu ține resurse la nesfârșit |
| Retry | fără retry / retry infinit / **retry limitat (max 5) cu backoff exponențial + jitter**; la 429 se respectă `Retry-After` | Limitat: după epuizare, starea devine `FAILED` și coordonatorul poate relua manual |
| Deduplicare | **cheie de idempotență (UUID) trimisă în header-ul `Idempotency-Key`**; registrul o reține și întoarce același rezultat | O livrare repetată nu creează două înregistrări în registru |
| Stări | `PENDING → SENT` sau `PENDING → FAILED` (după retry-uri epuizate); `FAILED → PENDING` la reluare manuală | Coerente și testabile |

## Plan de verificare (M2–M3)
Toate testele folosesc simulatorul configurat explicit (fără aleatoriu), deci sunt **deterministe**:
- registrul răspunde după 5 s → timeout → retry → succes la a doua încercare;
- 500 de 3 ori, apoi 200 → `SENT`, `attempts = 4`;
- 429 cu `Retry-After` → reîncercare după întârzierea cerută;
- eroare permanentă → `FAILED` după numărul maxim de încercări, fără buclă infinită;
- răspuns duplicat sau retrimitere → registrul are o singură înregistrare;
- client: răspunsul la sincronizare se pierde → clientul retrimite → serverul nu duplică (folosește `opId`).

## Limite (de completat în ADR)
- Worker-ul rulează în același proces cu serverul: dacă serverul se oprește, livrările `PENDING` sunt reluate la pornire (sunt salvate în baza de date), dar nu există coadă distribuită.
