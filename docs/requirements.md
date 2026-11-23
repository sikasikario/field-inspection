# Cerințe — Inspecții de teren offline (Tema 7)

## 1. Obiectiv
Inspectorii completează formulare de inspecție pe teren, unde conexiunea la internet lipsește sau e instabilă. Datele se salvează local și se sincronizează automat când rețeaua revine. Un coordonator repartizează inspecțiile, le verifică și vede rapoarte centrale.

## 2. Actori și roluri

| Rol | Ce poate face | Ce NU poate face |
|---|---|---|
| **Inspector** (rol obișnuit) | Vede doar inspecțiile proprii; completează checklist-ul online sau offline; creează inspecții neplanificate; trimite inspecția spre verificare; redeschide o inspecție respinsă | Nu vede inspecțiile altor inspectori; nu aprobă/respinge; nu creează asignări pentru alții; nu vede rapoartele centrale |
| **Coordonator** (rol privilegiat) | Creează asignări (inspecție + locație + șablon + inspector + termen); vede toate inspecțiile; aprobă sau respinge cu comentariu; vede raportul central | Nu completează răspunsurile în locul inspectorului |

Autentificarea și autorizarea se verifică **pe server** la fiecare cerere, nu doar în interfață.

## 3. Fluxul cu stări al unei inspecții

```
             (coordonator creează)            (inspector creează neplanificat)
                     │                                   │
                     ▼                                   │
                 ASSIGNED ──start (inspector)──► IN_PROGRESS ◄──reopen (inspector)── REJECTED
                                                    │                                   ▲
                                         submit (inspector,                             │
                                     toate obligatorii completate)            reject (coordonator,
                                                    ▼                          comentariu obligatoriu)
                                                SUBMITTED ──────────────────────────────┘
                                                    │
                                          approve (coordonator)
                                                    ▼
                                                APPROVED  (finală → livrată în registrul extern, pachet EXT)
```

Reguli:
- Răspunsurile se pot modifica doar în `ASSIGNED` și `IN_PROGRESS`.
- `submit` e permis doar dacă toate întrebările obligatorii au răspuns.
- `reject` cere comentariu.
- Un inspector poate acționa doar asupra inspecțiilor proprii.
- Implementare: `server/src/domain/inspectionStateMachine.js` (o singură sursă de adevăr, testată în `server/tests/stateMachine.test.js`).

## 4. Fluxuri utilizator și criterii de acceptare

### F1. Completarea unei inspecții offline (inspector)
- **Dat fiind** un inspector autentificat, cu inspecții asignate descărcate pe dispozitiv,
- **când** pierde conexiunea, completează răspunsurile și reîncarcă pagina,
- **atunci** aplicația pornește în continuare, iar răspunsurile sunt păstrate local (marcate „nesincronizat”).
- **Când** conexiunea revine, modificările se trimit automat, iar inspecția apare pe server o singură dată, cu toate răspunsurile.

### F2. Crearea unei inspecții neplanificate offline (inspector)
- Inspectorul alege locația și șablonul și completează inspecția fără rețea.
- La sincronizare, inspecția apare pe server cu **același ID** generat pe client; retransmiterea ei nu creează a doua inspecție.

### F3. Trimiterea spre verificare și decizia (inspector + coordonator)
- Inspectorul trimite inspecția; dacă lipsesc răspunsuri obligatorii, primește eroare clară.
- Coordonatorul o aprobă sau o respinge cu comentariu; inspectorul vede decizia la următoarea sincronizare.
- La aprobare, inspecția e livrată în registrul extern (simulat), cu retry limitat și fără duplicate.

### F4. Asignarea inspecțiilor și raportul central (coordonator)
- Coordonatorul creează o asignare; ea apare la inspector după sincronizare.
- Lista de inspecții are **filtrare** (stare, locație, inspector), **ordonare** (termen, dată actualizare) și **paginare**.
- Raportul central arată numărul de inspecții pe stare și pe locație și neconformitățile („nu” la întrebări da/nu).

## 5. Invariante critice (protejate pe server / în baza de date)
1. **Fără duplicate la retransmitere.** ID-ul inspecției este UUID generat de client (cheie primară). Fiecare operație de sincronizare are un `opId` unic, salvat în tabela `SyncOperation`; o operație repetată întoarce rezultatul inițial, fără a fi reaplicată. Un răspuns la o întrebare este unic pe pereche `(inspectionId, itemId)`.
2. **Conflicte rezolvate după o politică explicită.** Fiecare inspecție are un număr de versiune. O modificare trimisă cu o versiune veche este refuzată cu `409 Conflict` (detalii în `docs/packages/OFF.md`).
3. **Confidențialitate.** Un inspector nu poate citi, modifica sau găsi prin căutare inspecțiile altui inspector; verificarea se face pe server, pe fiecare obiect.
4. **Tranziții valide.** Starea se schimbă doar prin mașina de stări.

## 6. Scenarii obligatorii din fișa temei
- Minimum 30 de inspecții seed → `npm run seed` generează 36.
- Offline minimum 10 minute, cu reîncărcarea paginii înainte de revenirea online.
- OFF: creare/editare offline și sincronizare după restart.
- EXT: simulator de rețea cu timeout și răspunsuri duplicate.

## 7. Cerințe nefuncționale
- Interfață responsivă (telefon, tabletă, laptop).
- Validare pe server, erori în format unic `{ error: { code, message } }`, stări de încărcare/eroare în UI.
- Parole stocate doar ca hash (bcrypt); secretele în `.env`, niciodată în Git.
