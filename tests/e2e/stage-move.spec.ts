import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

const cases = JSON.parse(readFileSync('data/seed/cases.json', 'utf8')) as {
  id: string;
  stage: string;
}[];
const nonCompliant = cases.find((c) => c.stage === 'non_compliant')!.id;

const panel = (page: Page) => page.getByRole('region', { name: 'Confirm change' });
const moveButtons = (page: Page) =>
  page.getByRole('button', { name: /^(Move to |Send Notice to Cure|Mark cured|Close case)/ });

test.describe('sending a Notice to Cure', () => {
  test('gives a Non-Compliant case a deadline that shows everywhere and survives a refresh', async ({
    page,
  }) => {
    await signIn(page, `/cases/${nonCompliant}`);
    await page.getByRole('button', { name: 'Send Notice to Cure' }).click();
    await expect(panel(page)).toBeVisible();

    // The as-of date is the default send date; 5 business days from Tue Oct 13 ends Tue Oct 20.
    await panel(page).getByLabel('Number of days').fill('5');
    await expect(panel(page).getByTestId('deadline-preview')).toContainText('Tue, Oct 20');
    await panel(page).getByRole('button', { name: 'Send notice' }).click();

    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByText('Tue, Oct 20').first()).toBeVisible();
    await page.reload();
    await expect(page.getByText('Tue, Oct 20').first()).toBeVisible();

    // It is now a live deadline in the list: due within the next 7 days.
    await page.goto('/cases');
    await expect(
      page.locator(`[data-testid="group-week"] a[href="/cases/${nonCompliant}"]`),
    ).toBeVisible();
  });

  test('counts business days past a holiday, and shows the deadline before confirming', async ({
    page,
  }) => {
    await signIn(page, `/cases/${nonCompliant}`);
    await page.getByRole('button', { name: 'Send Notice to Cure' }).click();
    await panel(page).getByLabel('Date the notice was sent').fill('2026-09-28');
    await panel(page).getByLabel('Number of days').fill('10');
    await expect(panel(page).getByTestId('deadline-preview')).toContainText(
      'Tue, Oct 13, skipping Columbus Day',
    );
    await panel(page).getByLabel('Day type').selectOption('calendar');
    await expect(panel(page).getByTestId('deadline-preview')).toContainText('Thu, Oct 8');
  });

  test('refuses a missing or absurd cure period, and allows an explicit "No cure date"', async ({
    page,
  }) => {
    await signIn(page, `/cases/${nonCompliant}`);
    await page.getByRole('button', { name: 'Send Notice to Cure' }).click();
    const send = panel(page).getByRole('button', { name: 'Send notice' });

    await panel(page).getByLabel('Number of days').fill('0');
    await expect(send).toBeDisabled();
    await panel(page).getByLabel('Number of days').fill('999');
    await expect(send).toBeDisabled();
    await expect(panel(page).getByTestId('deadline-preview')).toContainText('from 1 to 365');

    await panel(page).getByLabel('No cure date').check();
    await expect(panel(page).getByTestId('deadline-preview')).toContainText(
      'No deadline will be set',
    );
    await expect(send).toBeEnabled();
    await send.click();
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Move to Default' })).toBeVisible();
  });
});

test.describe('moving cases from where Legal works', () => {
  test('the case list offers each move, with the same confirm step', async ({ page }) => {
    await signIn(page, '/cases');
    const toDefault = page.getByRole('button', { name: 'Move to Default' });
    await expect(toDefault.first()).toBeVisible();
    const before = await toDefault.count();

    await toDefault.first().click();
    await expect(panel(page)).toBeVisible();
    await panel(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(panel(page)).toHaveCount(0);
    expect(await toDefault.count()).toBe(before);

    await toDefault.first().click();
    await panel(page).getByRole('button', { name: 'Confirm' }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect(toDefault).toHaveCount(before - 1);
    await page.reload();
    await expect(toDefault).toHaveCount(before - 1);
  });

  test('the inbox offers the same moves', async ({ page }) => {
    await signIn(page, '/inbox');
    const toDefault = page.getByRole('button', { name: 'Move to Default' });
    await expect(toDefault.first()).toBeVisible();
    await toDefault.first().click();
    await expect(panel(page)).toBeVisible();
    await panel(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(panel(page)).toHaveCount(0);
  });

  test('read-only personas get no stage moves anywhere', async ({ page }) => {
    await signIn(page, '/');
    for (const path of [
      '/cases?as=am-lena-brooks',
      '/cases?as=founder',
      '/inbox?as=am-lena-brooks',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForTimeout(500);
      await expect(moveButtons(page)).toHaveCount(0);
    }
  });
});
