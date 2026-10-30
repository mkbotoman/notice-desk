import { expect, type Page } from '@playwright/test';

export const E2E_PASSWORD = 'e2e-password';

/** Passes the shared-password gate and lands on `path`. */
export async function signIn(page: Page, path = '/') {
  await page.goto(path);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}

export const navLabels = (page: Page) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link').allInnerTexts();

/** Link text includes the count badge; strip it to compare labels. */
export async function navNames(page: Page) {
  return (await navLabels(page)).map((t) => t.replace(/\s*\d+\s*$/, '').trim());
}
