import { test, expect } from '@playwright/test';
import { loginUi } from './helpers.js';

test('coordonator: filtrează, aprobă o inspecție trimisă și vede livrarea în raport', async ({ page }) => {
  await loginUi(page, 'coordonator@demo.ro');
  await expect(page.getByRole('heading', { name: 'Inspecții' })).toBeVisible();
  await expect(page.getByText('inspecții găsite')).toBeVisible();

  await page.getByLabel('Stare').selectOption('SUBMITTED');
  await expect(page).toHaveURL(/status=SUBMITTED/);
  const rows = page.locator('tbody tr');
  await expect(rows.first().locator('.status')).toHaveText('Trimisă');
  await rows.first().getByRole('link').click();

  await page.getByRole('button', { name: 'Aprobă' }).click();
  await expect(page.locator('.page-head .status')).toHaveText('Aprobată');

  await page.getByRole('link', { name: 'Raport' }).click();
  await expect(page.getByRole('heading', { name: 'Raport central' })).toBeVisible();
  await expect(page.getByText('Livrări către registrul extern')).toBeVisible();
  await expect(page.locator('.chip').first()).toBeVisible();
});

test('inspectorul nu are acces la paginile coordonatorului', async ({ page }) => {
  await loginUi(page, 'maria@demo.ro');
  await expect(page.getByRole('heading', { name: 'Inspecțiile mele' })).toBeVisible();
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Inspecțiile mele' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Raport' })).toHaveCount(0);
});
