import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

const read = <T>(file: string) => JSON.parse(readFileSync(`data/seed/${file}.json`, 'utf8')) as T;
const cases = read<{ id: string; tenantId: string }[]>('cases');
const tenants = read<{ id: string; displayName: string }[]>('tenants');

const perTenant = new Map<string, number>();
for (const c of cases) perTenant.set(c.tenantId, (perTenant.get(c.tenantId) ?? 0) + 1);
const ranked = [...perTenant].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
const [topId, topCount] = ranked[0];
const name = (id: string) => tenants.find((t) => t.id === id)!.displayName;

const stat = (page: Page, label: string) =>
  page
    .getByTestId('tenant-trend')
    .getByText(label, { exact: true })
    .locator('xpath=preceding-sibling::span[1]');

test.describe('a single tenant’s trend', () => {
  test('analytics lets you pick a tenant and shows their own numbers', async ({ page }) => {
    await signIn(page, '/analytics');
    const picker = page.getByLabel('Tenant to show');
    await expect(picker).toBeVisible();
    // The tenant with the most cases comes first.
    await expect(picker.locator('option').first()).toContainText(name(topId));
    await expect(stat(page, 'Cases')).toHaveText(String(topCount));
    for (const id of ['tt-sent', 'tt-activity', 'tt-age', 'tt-ar']) {
      await expect(page.getByTestId(`chart-${id}`)).toBeVisible();
    }

    const [secondId, secondCount] = ranked.find(([, n]) => n !== topCount) ?? ranked[1];
    await picker.selectOption(secondId);
    await expect(stat(page, 'Cases')).toHaveText(String(secondCount));
    await expect(page.getByRole('link', { name: 'Open tenant page' })).toHaveAttribute(
      'href',
      `/tenants/${secondId}`,
    );
  });

  test('every chart has the numbers behind it as a table', async ({ page }) => {
    await signIn(page, '/analytics');
    await expect(page.getByTestId('tenant-trend')).toBeVisible();
    for (const id of ['tt-sent', 'tt-age', 'tt-ar']) {
      const card = page.getByTestId(`chart-${id}`);
      await card.getByText('Data table').click();
      await expect(card.getByRole('table')).toBeVisible();
    }
  });

  test('the tenant page carries the same trend', async ({ page }) => {
    await signIn(page, `/tenants/${topId}`);
    await expect(page.getByRole('heading', { name: 'Trend' })).toBeVisible();
    await expect(stat(page, 'Cases')).toHaveText(String(topCount));
    await expect(page.getByTestId('chart-tt-sent')).toBeVisible();
  });

  test('a scoped persona only picks tenants with cases in their view', async ({ page }) => {
    await signIn(page, '/analytics');
    await expect(page.getByLabel('Tenant to show')).toBeVisible();
    const all = await page.getByLabel('Tenant to show').locator('option').count();
    await page.goto('/analytics?as=am-lena-brooks');
    await expect(page.getByLabel('Tenant to show')).toBeVisible();
    const hers = await page.getByLabel('Tenant to show').locator('option').count();
    expect(hers).toBeGreaterThan(0);
    expect(hers).toBeLessThan(all);
  });
});

test.describe('Maya’s overview links to the lists they count', () => {
  const count = (page: Page) => page.getByText(/^Showing \d+ of \d+ open cases/);

  test('each card opens the matching filtered case list', async ({ page }) => {
    await signIn(page, '/');
    const card = (label: string | RegExp) => page.getByRole('link', { name: label });

    await card(/^8\s*Overdue/).click();
    await expect(page).toHaveURL(/\/cases\?due=overdue/);
    await expect(count(page)).toContainText('Showing 8 of 30');

    await page.goto('/');
    await card(/^4\s*Due this week/).click();
    await expect(page).toHaveURL(/\/cases\?due=week/);
    await expect(count(page)).toContainText('Showing 4 of 30');

    await page.goto('/');
    await card(/^21\s*Waiting on Legal/).click();
    await expect(page).toHaveURL(/\/cases\?owner=legal/);
    await expect(count(page)).toContainText('Showing 21 of 30');

    await page.goto('/');
    await card(/^9\s*Waiting on Asset Mgmt/).click();
    await expect(page).toHaveURL(/\/cases\?owner=asset_management/);
    await expect(count(page)).toContainText('Showing 9 of 30');
  });

  test('a property in the rollup opens that property’s cases', async ({ page }) => {
    await signIn(page, '/');
    await page
      .getByRole('link', { name: /^Copper Creek Commons/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/cases\?property=/);
    await expect(count(page)).not.toContainText('Showing 30 of 30');
  });
});
