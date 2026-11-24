// Service worker: păstrează fișierele aplicației (HTML, JS, CSS) în cache,
// ca aplicația să se poată deschide și după un reload fără rețea.
// Cererile către /api NU trec prin cache: datele offline stau în IndexedDB.
const CACHE = 'fi-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Paginile: întâi rețeaua (ca să primim versiunea nouă), iar offline pagina din cache.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        (await caches.open(CACHE)).put('/', response.clone());
        return response;
      } catch {
        return (await caches.match('/', { ignoreVary: true })) ?? Response.error();
      }
    })());
    return;
  }

  // Fișierele statice (au hash în nume, deci nu se schimbă): întâi cache-ul.
  // ignoreVary: serverul trimite „Vary: Origin” (de la CORS), iar scripturile de tip modul au
  // header-ul Origin; fără opțiune, cache-ul nu le-ar recunoaște și aplicația nu ar porni offline.
  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreVary: true });
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
    return response;
  })());
});
