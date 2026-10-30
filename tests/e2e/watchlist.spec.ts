import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

// Counted by hand-written script from data/seed at the data date 2026-10-13 (not by the app):
// leases with no open case and a rent (31+ days, recorded or implied) or insurance signal, and
// leases whose only signal is an accounting-listed reason.
const MAYA = { breaches: 45, listed: 12 };
const LENA = { breaches: 16, listed: 7 };

const section = (page: Page, id: 'wl-breaches' | 'wl-listed') =>
  page.locator(`section[aria-labelledby="${id}"]`);
const rows = (page: Page, id: 'wl-breaches' | 'wl-listed') =>
  section(page, id).locator('li[data-lease]');

test.describe('watchlist', () => {
  test('Legal sees every lease with a warning sign and no case, breaches before listed risks', async ({
    page,
  }) => {
    await signIn(page, '/watchlist');
    await expect(page.getByTestId('watchlist-count')).toHaveText(String(MAYA.breaches));
    await expect(rows(page, 'wl-breaches')).toHaveCount(MAYA.breaches);
    await expect(rows(page, 'wl-listed')).toHaveCount(MAYA.listed);
    await expect(page.getByText(`${MAYA.breaches} leases look non-compliant`)).toBeVisible();
    await expect(section(page, 'wl-listed').getByRole('heading')).toContainText('Listed risks');
  });

  test('shows which signal fired, the balance, the insurance status and any aging gap', async ({
    page,
  }) => {
    await signIn(page, '/watchlist');
    const row = page.locator('li[data-lease="L-0140"]');
    await expect(row).toContainText('Quickfix Phone Repair');
    await expect(row).toContainText('Rent 61–90 days');
    await expect(row).toContainText(
      'Recorded aging is 61–90 days, but the balance implies 31–60 days',
    );
    await expect(row).toContainText('$25,319.64');
    await expect(row.getByRole('link', { name: 'Quickfix Phone Repair' })).toHaveAttribute(
      'href',
      '/tenants/T-quickfix-phone-repair',
    );
    // 19 leases have no certificate on file; 5 of them already have an open case.
    await expect(page.getByText('No insurance on file')).toHaveCount(14);
  });

  test('is scoped: Lena sees only her properties and no property-less leases', async ({ page }) => {
    await signIn(page, '/watchlist?as=am-lena-brooks');
    await expect(rows(page, 'wl-breaches')).toHaveCount(LENA.breaches);
    await expect(rows(page, 'wl-listed')).toHaveCount(LENA.listed);
    await expect(page.locator('li[data-lease="L-0273"]')).toHaveCount(0);

    await page.goto('/watchlist?as=maya');
    await expect(page.locator('li[data-lease="L-0273"]')).toHaveCount(1);
  });

  test('Open case as Maya moves the lease off the list and into the case list', async ({
    page,
  }) => {
    await signIn(page, '/watchlist');
    const first = rows(page, 'wl-breaches').first();
    const leaseId = (await first.getAttribute('data-lease'))!;
    const tenant = (await first.getByRole('link').first().innerText()).trim();

    await first.getByRole('button', { name: 'Open case' }).click();
    await expect(page.getByRole('status')).toContainText(`Case opened for ${tenant}`);
    await expect(page.getByTestId('watchlist-count')).toHaveText(String(MAYA.breaches - 1));
    await expect(page.locator(`li[data-lease="${leaseId}"]`)).toHaveCount(0);

    const href = (await page.getByRole('link', { name: 'View the case' }).getAttribute('href'))!;
    await page.goto('/cases');
    await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();

    await page.goto(href);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(tenant);
    await expect(page.getByText('Non-compliant').first()).toBeVisible();

    await page.goto('/watchlist');
    await expect(page.getByTestId('watchlist-count')).toHaveText(String(MAYA.breaches - 1));
    await expect(page.locator(`li[data-lease="${leaseId}"]`)).toHaveCount(0);
  });

  test('has no Open case button for the Founder or asset managers', async ({ page }) => {
    await signIn(page, '/watchlist?as=founder');
    await expect(rows(page, 'wl-breaches')).toHaveCount(MAYA.breaches);
    await expect(page.getByRole('button', { name: /Open case/ })).toHaveCount(0);

    await page.goto('/watchlist?as=am-lena-brooks');
    await expect(rows(page, 'wl-breaches')).toHaveCount(LENA.breaches);
    await expect(page.getByRole('button', { name: /Open case/ })).toHaveCount(0);

    await page.goto('/watchlist?as=maya');
    await expect(page.getByRole('button', { name: /Open case/ }).first()).toBeVisible();
  });

  test('is closed to property managers', async ({ page }) => {
    await signIn(page, '/watchlist?as=pm-leo-ward');
    await expect(page.getByText("This page isn't available in your current view")).toBeVisible();
    await expect(page.locator('li[data-lease]')).toHaveCount(0);
  });

  test('filters by signal type and property, and says when nothing matches', async ({ page }) => {
    await signIn(page, '/watchlist');
    await page.getByLabel('Signal').selectOption('listed');
    await expect(section(page, 'wl-breaches').locator('li[data-lease]').first()).toBeVisible();
    // Every listed-only row carries a listed reason, so that section is unchanged.
    await expect(rows(page, 'wl-listed')).toHaveCount(MAYA.listed);

    await page.getByLabel('Signal').selectOption('rent');
    await expect(rows(page, 'wl-listed')).toHaveCount(0);
    for (const row of await rows(page, 'wl-breaches').all()) {
      await expect(row).toContainText('Rent ');
    }

    await page.getByLabel('Property', { exact: true }).selectOption({ label: 'Unknown property' });
    await expect(page.getByText('No leases match these filters')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(rows(page, 'wl-breaches')).toHaveCount(MAYA.breaches);

    await page.getByLabel('Property', { exact: true }).selectOption({ label: 'Unknown property' });
    await expect(page.locator('li[data-lease="L-0273"]')).toBeVisible();
  });

  test('fits a phone screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // The nav collapses on a phone, so the helper's nav check does not apply.
    await signIn(page, '/watchlist').catch(() => undefined);
    await expect(rows(page, 'wl-breaches').first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole('button', { name: /Open case/ }).first()).toBeVisible();
  });
});
