# Utilizarea instrumentelor AI

## Instrumente
- **Claude (Anthropic)**: asistent pentru analiză, proiectare, generare de cod, teste și documentație.

## Mod de lucru
1. Formulez cerința pe baza fișei temei și a specificației generale.
2. Agentul propune cod sau documentație.
3. Inspectez modificările, rulez testele și verific comportamentul în aplicație.
4. Corectez sau cer corecturi când găsesc probleme.

## Caz tehnic semnificativ
*(de completat pe parcurs: cerință → intervenția agentului → inspecție → defect/limitare găsită → remediere → rezultat)*

## Jurnal de observații
- **M1:** `npm audit` a semnalat o vulnerabilitate moderată în pachetul `uuid` folosit intern de Sequelize. Rezolvat prin `overrides` în `package.json` (forțează `uuid@^11.1.1`), verificat cu `npm ls uuid`, `npm audit` (0 vulnerabilități) și rularea testelor.
