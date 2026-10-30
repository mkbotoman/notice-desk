import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD, signIn } from './helpers';

const rowNames = (page: Page) =>
  page
    .getByTestId('tenant-list')
    .getByRole('link')
    .evaluateAll((els) => els.map((el) => (el.children[0] as HTMLElement).innerText));

const viewAs = (page: Page, label: string) =>
  page.getByLabel('Viewing as').locator('visible=true').selectOption({ label });

test.describe('tenant index', () => {
  test('lists every tenant with leases, open cases and AR', async ({ page }) => {
    await signIn(page, '/tenants');
    await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible();
    await expect(page.getByText('74 tenants you can see')).toBeVisible();
    await expect(page.getByTestId('tenant-list').getByRole('link')).toHaveCount(74);
    const row = page.getByRole('link', { name: /Brightside Fitness LLC/ });
    await expect(row).toContainText('3 leases');
  });

  test('searches by name and by another spelling', async ({ page }) => {
    await signIn(page, '/tenants');
    const search = page.getByLabel('Search tenants');
    await search.fill('copper kettle');
    await expect(page.getByTestId('tenant-list').getByRole('link')).toHaveCount(1);
    await search.fill('brightside fitness, llc');
    await expect(page.getByRole('link', { name: /Brightside Fitness LLC/ })).toBeVisible();
    await search.fill('zzzz-nothing');
    await expect(page.getByText('No tenants match your search')).toBeVisible();
  });

  test('sorts by open cases and by total AR', async ({ page }) => {
    await signIn(page, '/tenants');
    const parse = (text: string) => Number(text.replace(/[^0-9.-]/g, ''));
    const column = async (nth: number) => {
      const rows = page.getByTestId('tenant-list').getByRole('link');
      const texts = await rows.evaluateAll(
        (els, n) => els.map((el) => (el.children[n] as HTMLElement).innerText),
        nth,
      );
      return texts.map(parse);
    };

    await page.getByRole('button', { name: /^Open cases/ }).click();
    const cases = await column(2);
    expect(cases).toEqual([...cases].sort((a, b) => b - a));
    expect(cases[0]).toBeGreaterThan(0);

    await page.getByRole('button', { name: /^Total AR/ }).click();
    const ar = await column(3);
    expect(ar).toEqual([...ar].sort((a, b) => b - a));
    await page.getByRole('button', { name: /^Total AR/ }).click();
    const asc = await column(3);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));

    await page.getByRole('button', { name: /^Name/ }).click();
    const names = await rowNames(page);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

test.describe('tenant detail', () => {
  test('shows each lease with its own stage on one screen', async ({ page }) => {
    await signIn(page, '/tenants/T-copper-kettle-cafe');
    await expect(page.getByRole('heading', { level: 1, name: 'Copper Kettle Cafe' })).toBeVisible();
    const cards = page.getByTestId('lease-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.filter({ hasText: 'Notice to Cure' })).toHaveCount(1);
    await expect(cards.filter({ hasText: 'Collections' })).toHaveCount(1);
    await expect(cards.filter({ hasText: 'No open case' })).toHaveCount(1);
    await expect(cards.first().getByText('Insurance certificate')).toBeVisible();
    await expect(page.getByTestId('tenant-timeline').getByRole('listitem').first()).toContainText(
      'Case ',
    );

    await cards.filter({ hasText: 'Collections' }).getByRole('link').click();
    await expect(page).toHaveURL(/\/cases\/N-/);
  });

  test('lists other name spellings, with a data-quality link only for Legal', async ({ page }) => {
    await signIn(page, '/tenants/T-brightside-fitness');
    const disclosure = page.locator('details', { hasText: 'Also appears as' });
    await disclosure.getByText('Also appears as').click();
    await expect(disclosure.getByText('BrightSide Fitness', { exact: true })).toBeVisible();
    await expect(disclosure.getByText('Brightside Fitness, LLC')).toBeVisible();
    await expect(disclosure.getByRole('link', { name: /merged/ })).toHaveAttribute(
      'href',
      '/data-quality',
    );

    await viewAs(page, 'Founder');
    await expect(disclosure.getByRole('link')).toHaveCount(1);
    await viewAs(page, 'Lena Brooks · Asset manager');
    await expect(page.getByText('Tenant not found')).toBeVisible();
  });

  test('narrows leases, counts and the index to the persona scope', async ({ page }) => {
    await signIn(page, '/tenants/T-copper-kettle-cafe');
    await expect(page.getByTestId('lease-card')).toHaveCount(3);
    await viewAs(page, 'Lena Brooks · Asset manager');
    await expect(page.getByTestId('lease-card')).toHaveCount(1);
    await expect(page.getByRole('main')).not.toContainText('Collections');

    await page.getByRole('link', { name: 'Tenants', exact: true }).first().click();
    await expect(page.getByText('56 tenants you can see')).toBeVisible();

    await viewAs(page, 'Nina Foster · Property manager');
    await expect(page.getByText('6 tenants you can see')).toBeVisible();
    await page.getByLabel('Search tenants').fill('trailhead');
    await page.getByRole('link', { name: /Trailhead Bikes/ }).click();
    await expect(page.getByTestId('lease-card')).toHaveCount(1);
  });

  test('shows a plain not-found state for an unknown tenant', async ({ page }) => {
    await signIn(page, '/tenants/T-does-not-exist');
    await expect(page.getByText('Tenant not found')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to all tenants' })).toBeVisible();
    await expect(page.getByTestId('lease-card')).toHaveCount(0);
  });
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  for (const path of ['/tenants', '/tenants/T-brightside-fitness']) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      await page.goto(path);
      await page.getByLabel('Password').fill(E2E_PASSWORD);
      await page.getByRole('button', { name: 'Enter' }).click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(
        page.getByTestId('lease-card').or(page.getByTestId('tenant-list')).first(),
      ).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
