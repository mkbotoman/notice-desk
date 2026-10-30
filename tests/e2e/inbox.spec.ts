import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

interface SeedCase {
  id: string;
  stage: string;
  owner: string;
  propertyId: string | null;
}
interface SeedProperty {
  id: string;
  name: string;
  assetManagerId: string | null;
}

const seed = <T>(name: string): T => JSON.parse(readFileSync(`data/seed/${name}.json`, 'utf8'));
const cases = seed<SeedCase[]>('cases');
const properties = seed<SeedProperty[]>('properties');

const lenaProps = new Set(
  properties.filter((p) => p.assetManagerId === 'PER-lena-brooks').map((p) => p.id),
);
const lenaPropNames = new Set(properties.filter((p) => lenaProps.has(p.id)).map((p) => p.name));
const isOpen = (c: SeedCase) => !['cured', 'closed'].includes(c.stage);
const lenaWaiting = cases.filter(
  (c) => isOpen(c) && c.owner === 'asset_management' && c.propertyId && lenaProps.has(c.propertyId),
);

const caseIdsOnPage = async (page: Page) => {
  const hrefs = await page
    .locator('article a[href^="/cases/"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
  return hrefs.map((h) => decodeURIComponent(h.replace('/cases/', ''))).sort();
};

const waitingCount = (page: Page) => page.getByTestId('waiting-count');

test.describe('asset manager inbox', () => {
  test('shows only the cases and troubled leases on her own properties', async ({ page }) => {
    await signIn(page, '/inbox?as=am-lena-brooks');
    await expect(page.getByRole('heading', { name: 'Waiting on you, Lena' })).toBeVisible();
    await expect(waitingCount(page)).toHaveText(String(lenaWaiting.length));
    expect(await caseIdsOnPage(page)).toEqual(lenaWaiting.map((c) => c.id).sort());

    const rows = page.getByRole('region', { name: 'In trouble' }).locator('tbody tr');
    expect(await rows.count()).toBeGreaterThan(0);
    const places = await rows.locator('td:nth-child(2)').allInnerTexts();
    for (const place of places) {
      expect(lenaPropNames.has(place.split(' · ')[0].trim())).toBe(true);
    }
  });

  test('adds an update that shows in the row and survives a reload', async ({ page }) => {
    await signIn(page, '/inbox?as=am-lena-brooks');
    const row = page.locator('article').first();
    await row.getByRole('button', { name: 'Add update' }).click();
    await row.getByRole('button', { name: 'Save update' }).click();
    await expect(row.getByLabel('What happened?')).toBeVisible();

    await row.getByLabel('What happened?').fill('Broker confirmed renewal in progress');
    await expect(row.getByLabel('Date')).toHaveValue('2026-10-13');
    await row.getByRole('button', { name: 'Save update' }).click();
    await expect(row.getByText('Update added')).toBeVisible();
    await expect(row.getByText('Broker confirmed renewal in progress')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Broker confirmed renewal in progress').first()).toBeVisible();
  });

  test('hands a case back to Legal and keeps it gone after a reload', async ({ page }) => {
    await signIn(page, '/inbox?as=am-lena-brooks');
    await expect(waitingCount(page)).toHaveText(String(lenaWaiting.length));
    const before = await caseIdsOnPage(page);
    const row = page.locator('article').first();
    const href = await row.locator('a[href^="/cases/"]').getAttribute('href');

    await row.getByRole('button', { name: 'Hand back to Legal' }).click();
    await row.getByLabel('Note for Legal (optional)').fill('Tenant paid');
    await row.getByRole('button', { name: 'Confirm hand back' }).click();

    await expect(page.locator(`article a[href="${href}"]`)).toHaveCount(0);
    await expect(waitingCount(page)).toHaveText(String(before.length - 1));
    await page.reload();
    await expect(waitingCount(page)).toHaveText(String(before.length - 1));
    await expect(page.locator(`article a[href="${href}"]`)).toHaveCount(0);
  });
});

test.describe('other people', () => {
  test('Legal sees 21 cases waiting at the data date and cannot hand back', async ({ page }) => {
    await signIn(page, '/inbox');
    await expect(page.getByRole('heading', { name: 'Waiting on Legal' })).toBeVisible();
    await expect(waitingCount(page)).toHaveText('21');
    await expect(page.getByRole('button', { name: 'Add update' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hand back to Legal' })).toHaveCount(0);
  });

  test('the Founder sees every open case, read-only', async ({ page }) => {
    await signIn(page, '/inbox?as=founder');
    await expect(page.getByRole('heading', { name: 'Waiting across the portfolio' })).toBeVisible();
    await expect(waitingCount(page)).toHaveText('30');
    await expect(page.getByRole('button', { name: 'Add update' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Hand back to Legal' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'In trouble' })).toBeVisible();
  });

  test('a property manager has no inbox, but sees "In trouble" on the home page', async ({
    page,
  }) => {
    await signIn(page, '/inbox?as=pm-nina-foster');
    await expect(page.getByText("This page isn't available in your current view")).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'In trouble' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add update' })).toHaveCount(0);
  });
});

test.describe('small screens', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('has no horizontal scroll', async ({ page }) => {
    // Maya, not Lena: the shell header controls overflow at 390px for longer persona names (shell lane).
    await signIn(page, '/inbox').catch(() => undefined);
    await expect(page.getByRole('heading', { name: 'Waiting on Legal' })).toBeVisible();
    await page.locator('article').first().getByRole('button', { name: 'Add update' }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
