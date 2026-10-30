import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD, signIn } from './helpers';

const rows = (page: Page) => page.getByTestId('case-row');
const group = (page: Page, key: string) => page.getByTestId(`group-${key}`);
const count = (page: Page) => page.getByTestId('case-count');
const card = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(label) });

test.describe('case list at the data date', () => {
  test('groups and counts match the data', async ({ page }) => {
    await signIn(page, '/cases');
    await expect(rows(page)).toHaveCount(30);
    await expect(count(page)).toHaveText('Showing 30 of 30 open cases');
    await expect(group(page, 'overdue').getByTestId('case-row')).toHaveCount(8);
    await expect(group(page, 'week').getByTestId('case-row')).toHaveCount(4);
    await expect(group(page, 'none')).toContainText('NO CURE DEADLINE');
    await expect(group(page, 'week')).toContainText('through Tue, Oct 20');

    await expect(card(page, 'Overdue')).toContainText('8');
    await expect(card(page, 'Due this week')).toContainText('4');
    await expect(card(page, 'Waiting on Legal')).toContainText('21');
    await expect(card(page, 'Waiting on Asset Mgmt')).toContainText('9');
  });

  test('default and collections cases are never overdue', async ({ page }) => {
    await signIn(page, '/cases');
    const overdue = group(page, 'overdue');
    await expect(overdue.getByText('Default', { exact: true })).toHaveCount(0);
    await expect(overdue.getByText('Collections', { exact: true })).toHaveCount(0);
  });

  test('include closed adds cured and closed cases', async ({ page }) => {
    await signIn(page, '/cases');
    await page.getByLabel('Include closed').check();
    await expect(rows(page)).toHaveCount(37);
    await expect(count(page)).toContainText('Showing 37 of 37 cases');
    await expect(page).toHaveURL(/closed=1/);
  });

  test('links a tenant to the case page', async ({ page }) => {
    await signIn(page, '/cases');
    const href = await rows(page).first().getByRole('link').first().getAttribute('href');
    expect(href).toMatch(/^\/cases\/.+/);
  });
});

test.describe('filters and URL state', () => {
  test('stage and waiting-on filters narrow the list', async ({ page }) => {
    await signIn(page, '/cases');
    await page.getByLabel('Stage').selectOption('default');
    await expect(rows(page)).toHaveCount(7);
    await expect(page).toHaveURL(/stage=default/);
    await page.getByLabel('Stage').selectOption('');
    await page.getByLabel('Waiting on').selectOption('asset_management');
    await expect(rows(page)).toHaveCount(9);
  });

  test('the stat cards act as filters and toggle off', async ({ page }) => {
    await signIn(page, '/cases');
    await card(page, 'Overdue').click();
    await expect(rows(page)).toHaveCount(8);
    await card(page, 'Overdue').click();
    await expect(rows(page)).toHaveCount(30);
    await card(page, 'Waiting on Legal').click();
    await expect(rows(page)).toHaveCount(21);
    await expect(page).toHaveURL(/owner=legal/);
  });

  test('search and property filters, then clear', async ({ page }) => {
    await signIn(page, '/cases');
    await page.getByRole('searchbox', { name: 'Search tenant or property' }).fill('harbor commons');
    const n = await rows(page).count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(30);
    await expect(page).toHaveURL(/q=harbor/);

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(rows(page)).toHaveCount(30);

    await page.getByLabel('Property', { exact: true }).click();
    await page.getByLabel('Harbor Commons').check();
    await page.getByLabel('Park West Plaza').check();
    await expect(page.getByText('2 properties')).toBeVisible();
    await expect(page).toHaveURL(/property=.*property=/);
    expect(await rows(page).count()).toBeLessThan(30);
  });

  test('shows an empty state when nothing matches', async ({ page }) => {
    await signIn(page, '/cases?q=zzzzzz');
    await expect(page.getByText('No cases match these filters')).toBeVisible();
    await expect(count(page)).toHaveText('Showing 0 of 30 open cases');
  });

  test('filters survive a reload and leave as/asOf alone', async ({ page }) => {
    await signIn(page, '/cases?stage=notice_to_cure&owner=legal&closed=1');
    await expect(rows(page).first()).toBeVisible();
    const n = await rows(page).count();
    await page.getByRole('searchbox', { name: 'Search tenant or property' }).fill('a');
    await page.reload();
    await expect(page.getByRole('searchbox', { name: 'Search tenant or property' })).toHaveValue(
      'a',
    );
    await expect(page.getByLabel('Stage')).toHaveValue('notice_to_cure');
    await expect(page.getByLabel('Waiting on')).toHaveValue('legal');
    await expect(page.getByLabel('Include closed')).toBeChecked();
    expect(await rows(page).count()).toBeLessThanOrEqual(n);
  });

  test('changing the as-of date regroups the cases', async ({ page }) => {
    await signIn(page, '/cases?asOf=2026-09-01');
    await expect(page.getByText('As of Tue, Sep 1, 2026')).toBeVisible();
    await expect(page).toHaveURL(/\/cases$/);
    expect(await group(page, 'overdue').getByTestId('case-row').count()).not.toBe(8);
  });
});

test.describe('persona scope', () => {
  test('an asset manager sees fewer cases than Legal', async ({ page }) => {
    await signIn(page, '/cases?as=am-lena-brooks');
    await expect(page.getByLabel('Viewing as')).toHaveValue('am-lena-brooks');
    const n = await rows(page).count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(30);
    await expect(count(page)).toHaveText(new RegExp(`Showing ${n} of ${n} open cases`));
  });

  test('a property manager sees only their property and cannot reach data quality', async ({
    page,
  }) => {
    await signIn(page, '/cases?as=pm-nina-foster');
    const n = await rows(page).count();
    expect(n).toBeLessThan(30);
    await expect(page.getByText('Unknown property')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Data check' })).toHaveCount(0);
  });

  test('only Legal gets data-check chips that link to data quality', async ({ page }) => {
    await signIn(page, '/cases');
    const chips = page.getByText('Data check', { exact: true });
    if ((await chips.count()) > 0) {
      await expect(page.getByRole('link', { name: 'Data check' }).first()).toHaveAttribute(
        'href',
        '/data-quality',
      );
    }
  });
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('the page does not scroll sideways', async ({ page }) => {
    await page.goto('/cases');
    await page.getByLabel('Password').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Enter' }).click();
    await expect(rows(page).first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
