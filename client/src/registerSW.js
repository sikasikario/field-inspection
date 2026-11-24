// Înregistrează service worker-ul (doar în build-ul de producție; în `npm run dev` ar încurca
// reîncărcarea automată a codului).
export const SHELL_CACHE = 'fi-shell-v1';

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js');
      // La prima vizită, fișierele aplicației au fost descărcate înainte ca service worker-ul
      // să fie activ. Le punem în cache acum, ca aplicația să pornească offline de la următorul reload.
      const urls = performance.getEntriesByType('resource')
        .map((e) => new URL(e.name))
        .filter((u) => u.origin === location.origin && !u.pathname.startsWith('/api/'))
        .map((u) => u.pathname);
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(['/', ...new Set(urls)]);
    } catch (err) {
      console.warn('Service worker indisponibil:', err);
    }
  });
}
