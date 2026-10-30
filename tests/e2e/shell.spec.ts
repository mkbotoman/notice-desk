import { expect, test } from '@playwright/test';
import { E2E_PASSWORD, navNames, signIn } from './helpers';

const ALL_NAV = [
  'Cases',
  'Waiting on me',
  'Tenants',
  'Outbox',
  'Analytics',
  'Watchlist',
  'Weekly summary',
  'Data quality',
];

test.describe('password gate', () => {
  test('sends signed-out visitors to the gate and keeps the page they asked for', async ({
    page,
  }) => {
    await page.goto('/cases');
    await expect(page).toHaveURL(/\/gate\?next=%2Fcases/);
    await page.getByLabel('Password').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Enter' }).click();
    await expect(page).toHaveURL(/\/cases$/);
  });

  test('rejects a wrong password with a message', async ({ page }) => {
    await page.goto('/gate');
    await page.getByLabel('Password').fill('nope');
    await page.getByRole('button', { name: 'Enter' }).click();
    await expect(page.locator('#password-error')).toContainText("didn't work");
    await expect(page).toHaveURL(/\/gate/);
  });
});

test.describe('shell and personas', () => {
  test('opens as Maya with the full nav and the data date', async ({ page }) => {
    await signIn(page);
    expect(await navNames(page)).toEqual(ALL_NAV);
    await expect(page.getByTestId('persona-chip')).toContainText('Maya · Legal · full access');
    await expect(page.getByText('As of Tue, Oct 13, 2026')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('shows overdue and due-this-week counts that match the data at the data date', async ({
    page,
  }) => {
    await signIn(page);
    const stat = (label: string) =>
      page.getByText(label, { exact: true }).locator('xpath=preceding-sibling::span[1]');
    await expect(stat('Overdue')).toHaveText('8');
    await expect(stat('Due this week')).toHaveText('4');
    await expect(stat('Open cases')).toHaveText('30');
  });

  test('switching persona changes the nav and the data immediately', async ({ page }) => {
    await signIn(page);
    await page.getByLabel('Viewing as').selectOption({ label: 'Lena Brooks · Asset manager' });
    expect(await navNames(page)).toEqual([
      'Cases',
      'Waiting on me',
      'Tenants',
      'Analytics',
      'Watchlist',
      'Weekly summary',
    ]);
    await expect(page.getByTestId('persona-chip')).toContainText(
      'can add updates on 10 properties',
    );
    await expect(
      page.getByText('Open cases', { exact: true }).locator('xpath=preceding-sibling::span[1]'),
    ).not.toHaveText('30');

    await page.getByLabel('Viewing as').selectOption({ label: 'Nina Foster · Property manager' });
    expect(await navNames(page)).toEqual(['Cases', 'Tenants']);
    await expect(page.getByTestId('persona-chip')).toContainText('read-only on 1 property');

    await page.getByLabel('Viewing as').selectOption({ label: 'Founder' });
    expect(await navNames(page)).toEqual([
      'Cases',
      'Waiting on me',
      'Tenants',
      'Analytics',
      'Watchlist',
      'Weekly summary',
      'Data quality',
    ]);
  });

  test('keeps the chosen persona across a reload', async ({ page }) => {
    await signIn(page);
    await page.getByLabel('Viewing as').selectOption({ label: 'Founder' });
    await page.reload();
    await expect(page.getByLabel('Viewing as')).toHaveValue('founder');
    await expect(page.getByTestId('persona-chip')).toContainText('Founder');
  });

  test('applies ?as= from a link and removes it from the address bar', async ({ page }) => {
    await page.goto('/?as=am-lena-brooks');
    await page.getByLabel('Password').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Enter' }).click();
    await expect(page.getByLabel('Viewing as')).toHaveValue('am-lena-brooks');
    await expect(page).toHaveURL(/\/$/);
  });

  test('ignores an unknown ?as=', async ({ page }) => {
    await signIn(page, '/?as=nobody');
    await expect(page.getByLabel('Viewing as')).toHaveValue('maya');
  });

  test('blocks a page the current persona cannot use', async ({ page }) => {
    await signIn(page, '/analytics?as=pm-nina-foster');
    await expect(page.getByText("This page isn't available in your current view")).toBeVisible();
    await page.getByLabel('Viewing as').selectOption({ label: 'Maya · Legal' });
    await expect(page.getByText('Analytics is coming next')).toBeVisible();
  });
});

test.describe('as-of date', () => {
  test('changes the numbers and can be reset to the data date', async ({ page }) => {
    await signIn(page);
    const overdue = page
      .getByText('Overdue', { exact: true })
      .locator('xpath=preceding-sibling::span[1]');
    await expect(overdue).toHaveText('8');

    await page.getByText(/^As of /).click();
    await page.getByLabel('Show the app as of').fill('2026-09-01');
    await expect(page.getByText('As of Tue, Sep 1, 2026')).toBeVisible();
    await expect(page.getByText('Changed', { exact: true })).toBeVisible();
    await expect(overdue).not.toHaveText('8');

    await page.getByRole('button', { name: /^Data date/ }).click();
    await expect(page.getByText('As of Tue, Oct 13, 2026')).toBeVisible();
    await expect(overdue).toHaveText('8');
  });

  test('applies ?asOf= from a link', async ({ page }) => {
    await signIn(page, '/?asOf=2026-11-02');
    await expect(page.getByText('As of Mon, Nov 2, 2026')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('ignores an invalid ?asOf=', async ({ page }) => {
    await signIn(page, '/?asOf=2026-02-30');
    await expect(page.getByText('As of Tue, Oct 13, 2026')).toBeVisible();
  });
});

test.describe('small screens', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('hides the sidebar behind a menu button', async ({ page }) => {
    await signIn(page).catch(() => undefined);
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Tenants/ }),
    ).toBeVisible();
    await page.getByRole('link', { name: /^Tenants/ }).click();
    await expect(page).toHaveURL(/\/tenants$/);
    await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tenants', exact: true })).toBeVisible();
  });

  test('has no horizontal scroll with the longest persona name selected', async ({ page }) => {
    await page.goto('/?as=am-lena-brooks');
    await page.getByLabel('Password').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Enter' }).click();
    await expect(page.getByLabel('Viewing as')).toHaveValue('am-lena-brooks');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('has no horizontal scroll on the overview', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Password').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Enter' }).click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
