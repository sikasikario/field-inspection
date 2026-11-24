// Baza de date locală (IndexedDB), câte una pentru fiecare utilizator.
//   inspections: copia de pe server (data) + modificările locale nesincronizate (draft)
//   outbox:      coada de operații de trimis, în ordinea în care au fost făcute
//   meta:        șabloane, locații, momentul ultimei sincronizări
import { openDB } from 'idb';

export function openUserDb(userId) {
  return openDB(`field-inspection-u${userId}`, 1, {
    upgrade(db) {
      db.createObjectStore('inspections', { keyPath: 'id' });
      const outbox = db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      outbox.createIndex('byInspection', 'inspectionId');
      db.createObjectStore('meta');
    },
  });
}
