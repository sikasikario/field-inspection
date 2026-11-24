// Pachetul OFF + simulatorul de rețea (EXT), verificate într-un browser real.
import { test, expect } from '@playwright/test';
import { loginUi, waitSynced, waitOfflineReady, apiAs, answerAll, waitSavedLocally } from './helpers.js';

test.describe.configure({ mode: 'serial' });

// Cât stă testul fără rețea. Implicit 20 s (rapid); scenariul complet din fișa temei (10 minute):
//   E2E_OFFLINE_MS=600000 npm run e2e
const OFFLINE_MS = Number(process.env.E2E_OFFLINE_MS ?? 20_000);

/** Câte încercări de trimitere eșuate are prima operație din coada locală (citit din IndexedDB). */
function outboxAttempts(page, userId) {
  return page.evaluate((id) => new Promise((resolve) => {
    const req = indexedDB.open(`field-inspection-u${id}`);
    req.onsuccess = () => {
      const all = req.result.transaction('outbox').objectStore('outbox').getAll();
      all.onsuccess = () => resolve(all.result.map((o) => o.attempts));
    };
  }), userId);
}

test('OFF: completare offline, reload, perioadă lungă fără rețea, apoi sincronizare fără duplicate', async ({ page, context, playwright, baseURL }) => {
  test.setTimeout(90_000 + OFFLINE_MS);
  const ion = await apiAs(playwright, baseURL, 'ion@demo.ro');
  const before = await ion.get('/inspections?pageSize=100');
  const target = before.items.find((i) => i.status === 'ASSIGNED');

  await loginUi(page, 'ion@demo.ro');
  await waitSynced(page);
  await waitOfflineReady(page);

  // --- fără rețea (ca în mod avion) ---
  await context.setOffline(true);
  await page.goto(`/inspections/${target.id}`); // deschisă offline, servită de service worker
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(target.site.name);
  const questionCount = await answerAll(page);
  const userId = (await ion.get('/auth/me')).user.id;
  await waitSavedLocally(page, userId, target.id, questionCount);
  await expect(page.getByTestId('syncbar')).toContainText('nesincronizat');

  // Reîncărcarea paginii offline: aplicația pornește, răspunsurile sunt încă acolo.
  await page.reload();
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();
  const firstChoice = page.locator('fieldset.question').first().locator('label.choice.selected');
  await expect(firstChoice).toHaveText('Da');

  // Trimiterea spre verificare, tot offline.
  await page.getByRole('button', { name: 'Trimite spre verificare' }).click();
  await expect(page.getByText('Trimisă (în așteptare)')).toBeVisible();

  // Rămânem offline (implicit 20 s, sau 10 minute cu E2E_OFFLINE_MS=600000). Motorul reîncearcă
  // periodic (backoff) și eșuează, dar nu pierde nimic; la final mai reîncărcăm o dată pagina.
  await page.waitForTimeout(OFFLINE_MS);
  const attempts = await outboxAttempts(page, userId);
  expect(attempts.length).toBeGreaterThan(0);
  expect(attempts[0]).toBeGreaterThanOrEqual(2); // a încercat de mai multe ori și a eșuat
  await page.reload();
  await expect(page.getByText('Trimisă (în așteptare)')).toBeVisible();

  // Pe server încă nu s-a schimbat nimic.
  expect((await ion.get(`/inspections/${target.id}`)).status).toBe('ASSIGNED');

  // --- revine rețeaua ---
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Sincronizează acum' }).click();
  await waitSynced(page);
  await expect(page.getByText('Trimisă', { exact: true })).toBeVisible();

  const after = await ion.get(`/inspections/${target.id}`);
  expect(after.status).toBe('SUBMITTED');
  expect(after.answers).toHaveLength(questionCount); // toate răspunsurile date offline au ajuns
  expect((await ion.get('/inspections?pageSize=100')).total).toBe(before.total); // nicio inspecție dublată
  await ion.dispose();
});

test('EXT (client): răspuns pierdut + cerere duplicată la crearea unei inspecții noi', async ({ page, playwright, baseURL }) => {
  const ion = await apiAs(playwright, baseURL, 'ion@demo.ro');
  const before = (await ion.get('/inspections?pageSize=100')).total;

  await loginUi(page, 'ion@demo.ro');
  await waitSynced(page);

  // Programăm defectele: prima sincronizare ajunge la server dar răspunsul se pierde,
  // a doua (retransmiterea) e trimisă de două ori simultan.
  await page.getByRole('button', { name: /Simulator de rețea/ }).click();
  await page.getByRole('button', { name: '+ Răspuns pierdut' }).click();
  await page.getByRole('button', { name: '+ Cerere duplicată' }).click();

  await page.getByRole('link', { name: 'Inspecție nouă' }).first().click();
  await page.getByLabel('Locație').selectOption({ label: 'Magazin Berceni' });
  await page.getByLabel('Tip de inspecție').selectOption({ label: 'Inspecție instalație electrică' });
  await page.getByRole('button', { name: 'Creează și începe' }).click();
  await answerAll(page);
  await expect(page.locator('fieldset.question').first().locator('label.choice.selected')).toHaveText('Da');

  // Așteptăm până când răspunsurile ajung pe server (după retransmiteri).
  const id = page.url().split('/').pop();
  await expect.poll(async () => (await ion.get(`/inspections/${id}`)).answers?.length ?? 0, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  await waitSynced(page);
  await expect(page.locator('.netsim-log')).toContainText('răspunsul s-a pierdut');
  await expect(page.locator('.netsim-log')).toContainText('trimisă de 2 ori');

  const all = await ion.get('/inspections?pageSize=100');
  expect(all.total).toBe(before + 1); // exact una nouă, deși crearea a ajuns de 3 ori la server
  const created = await ion.get(`/inspections/${id}`);
  expect(created.status).toBe('IN_PROGRESS');
  await ion.dispose();
});

test('OFF: conflict cu o modificare de pe alt dispozitiv, rezolvat păstrând varianta locală', async ({ page, context, playwright, baseURL }) => {
  const ion = await apiAs(playwright, baseURL, 'ion@demo.ro');
  const target = (await ion.get('/inspections?status=IN_PROGRESS&pageSize=100')).items[0];
  const full = await ion.get(`/inspections/${target.id}`);
  const templates = await ion.get('/templates');
  const firstItem = templates.items.find((t) => t.id === target.templateId).items[0];

  await loginUi(page, 'ion@demo.ro');
  await waitSynced(page);
  await page.goto(`/inspections/${target.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(target.site.name);

  // Offline, inspectorul răspunde „Nu” la prima întrebare.
  await context.setOffline(true);
  await page.locator('fieldset.question').first().getByText('Nu', { exact: true }).click();
  await expect(page.getByTestId('syncbar')).toContainText('nesincronizat');

  // Între timp, de pe alt dispozitiv, aceeași inspecție e modificată (versiunea crește).
  const other = await ion.put(`/inspections/${target.id}/answers`, { baseVersion: full.version, answers: [{ itemId: firstItem.id, value: 'da' }] });
  expect(other.status()).toBe(200);

  await context.setOffline(false);
  await page.getByRole('button', { name: 'Sincronizează acum' }).click();
  const banner = page.getByTestId('conflict');
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await expect(banner).toContainText('modificată în altă parte');
  await expect(banner.locator('tbody tr')).toHaveCount(1);

  await banner.getByRole('button', { name: 'Păstrează varianta mea' }).click();
  await expect(banner).toBeHidden();
  await waitSynced(page);

  const after = await ion.get(`/inspections/${target.id}`);
  expect(after.answers.find((a) => a.itemId === firstItem.id).value).toBe('nu');
  expect(after.version).toBe(full.version + 2); // modificarea celuilalt dispozitiv + a noastră
  await ion.dispose();
});
