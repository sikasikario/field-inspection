# Model de sarcină și capacitate

## Model de sarcină (presupuneri M1)
Fișa temei nu fixează un număr de utilizatori, așa că propunem un scenariu realist pentru o firmă mică–medie de inspecții:

| Parametru | Valoare |
|---|---|
| Inspectori activi simultan | 50 |
| Date | 36 inspecții seed (minimum 30); pentru test se poate genera un volum mai mare |
| Mix de operații | 60% citiri (listă, detaliu), 30% sincronizare (loturi de 1–5 operații), 10% raport coordonator |
| Vârf tipic | dimineața (descărcare asignări) și seara (sincronizare după teren) |
| Obiective | p95 < 300 ms la citiri, p95 < 500 ms la sincronizare, erori < 1% |

## Test de încărcare (M3)
Instrument: **k6**. Trei niveluri: 10, 50 și 100 de utilizatori virtuali simultan.
Raportăm: throughput (cereri/s), p50/p95, rata erorilor, CPU/memorie ale procesului Node, configurația mașinii (MacBook Air M4).

## Blocaj probabil
SQLite permite un singur scriitor simultan. La multe sincronizări simultane, scrierile se pot bloca. Vom măsura și, dacă e cazul, documenta atenuări (tranzacții scurte, modul WAL).
