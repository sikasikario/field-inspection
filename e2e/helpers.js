import { expect } from '@playwright/test';

export const PASSWORD = 'parola123';

export async function loginUi(page, email) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Parolă').fill(PASSWORD);
  await page.getByRole('button', { name: 'Intră în cont' }).click();
}

/** Așteaptă până când coada e goală și s-a făcut cel puțin o sincronizare. */
export async function waitSynced(page) {
  const bar = page.getByTestId('syncbar');
  await expect(bar).toContainText('Totul este sincronizat', { timeout: 20_000 });
  await expect(bar).not.toContainText('ultima sincronizare: —');
}

/** Așteaptă ca service worker-ul să controleze pagina și fișierele aplicației să fie în cache. */
export async function waitOfflineReady(page) {
  await page.waitForFunction(async () => {
    if (!navigator.serviceWorker?.controller) return false;
    const cache = await caches.open('fi-shell-v1');
    const keys = await cache.keys();
    return keys.some((r) => r.url.includes('/assets/') && r.url.endsWith('.js'));
  }, null, { timeout: 20_000 });
}

/** Client API separat (alt „dispozitiv”), pentru pregătirea și verificarea datelor. */
export async function apiAs(playwright, baseURL, email) {
  const ctx = await playwright.request.newContext({ baseURL });
  const res = await ctx.post('/api/auth/login', { data: { email, password: PASSWORD } });
  const { token } = await res.json();
  const headers = { Authorization: `Bearer ${token}` };
  return {
    get: async (path) => (await ctx.get(`/api${path}`, { headers })).json(),
    put: async (path, data) => ctx.put(`/api${path}`, { headers, data }),
    post: async (path, data) => ctx.post(`/api${path}`, { headers, data }),
    dispose: () => ctx.dispose(),
  };
}

/** Completează toate întrebările de pe pagina unei inspecții. */
export async function answerAll(page) {
  const questions = page.locator('fieldset.question');
  await questions.first().waitFor(); // pagina s-a încărcat
  const n = await questions.count();
  for (let i = 0; i < n; i++) {
    const q = questions.nth(i);
    if (await q.locator('input[type=radio]').count()) await q.getByText('Da', { exact: true }).click();
    else if (await q.locator('textarea').count()) await q.locator('textarea').fill('Totul în regulă');
    else await q.locator('input').fill('4');
  }
  await page.locator('body').click(); // blur → salvare
  return n;
}

/** Așteaptă ca toate răspunsurile să fie scrise în baza locală (IndexedDB) a inspecției. */
export async function waitSavedLocally(page, userId, inspectionId, count) {
  await expect.poll(() => page.evaluate(([uid, id]) => new Promise((resolve) => {
    const req = indexedDB.open(`field-inspection-u${uid}`);
    req.onsuccess = () => {
      const get = req.result.transaction('inspections').objectStore('inspections').get(id);
      get.onsuccess = () => {
        const r = get.result;
        const keys = new Set([...(r?.data.answers ?? []).map((a) => String(a.itemId)), ...Object.keys(r?.draft.answers ?? {})]);
        resolve(keys.size);
      };
    };
  }), [userId, inspectionId]), { timeout: 10_000 }).toBeGreaterThanOrEqual(count);
}
