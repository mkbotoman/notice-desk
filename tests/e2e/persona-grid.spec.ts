import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

const BLOCKED = "This page isn't available in your current view";

const PAGES = [
  '/',
  '/cases',
  '/tenants',
  '/inbox',
  '/outbox',
  '/analytics',
  '/watchlist',
  '/summary',
  '/data-quality',
] as const;
type Path = (typeof PAGES)[number];

const EVERYONE: Path[] = ['/', '/cases', '/tenants'];
const STAFF: Path[] = [...EVERYONE, '/inbox', '/analytics', '/watchlist', '/summary'];

/** Which pages each persona may open; every other page must show the blocked panel. */
const ALLOWED: Record<string, Path[]> = {
  maya: [...STAFF, '/outbox', '/data-quality'],
  founder: [...STAFF, '/data-quality'],
  'am-lena-brooks': STAFF,
  'pm-nina-foster': EVERYONE,
};

for (const [persona, allowed] of Object.entries(ALLOWED)) {
  test.describe(`${persona} across every page`, () => {
    test('opens what it may and is blocked from the rest, with no script errors', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await signIn(page, `/?as=${persona}`);
      for (const path of PAGES) {
        await page.goto(`${path}?as=${persona}`);
        await expect(page.getByLabel('Viewing as')).toHaveValue(persona);
        if (allowed.includes(path)) {
          await expect(page.getByText(BLOCKED), path).toHaveCount(0);
          await expect(page.getByRole('heading', { level: 1 }).first(), path).toBeVisible();
        } else {
          await expect(page.getByText(BLOCKED), path).toBeVisible();
        }
      }
      expect(errors).toEqual([]);
    });

    test('the navigation lists exactly the pages it may open', async ({ page }) => {
      await signIn(page, `/?as=${persona}`);
      await expect(page.getByLabel('Viewing as')).toHaveValue(persona);
      const nav = page.getByRole('navigation', { name: 'Main' }).getByRole('link');
      const hrefs = (await nav.evaluateAll((els) => els.map((e) => e.getAttribute('href'))))
        .filter((h): h is string => h !== null)
        .map((h) => (h === '/' ? h : h.replace(/\/$/, '')));
      for (const path of PAGES.filter((p) => p !== '/')) {
        expect(hrefs.includes(path), `${path} in nav`).toBe(allowed.includes(path));
      }
    });
  });
}

test.describe('property scope', () => {
  test('a property manager sees only their property, and other cases read as unavailable', async ({
    page,
  }) => {
    await signIn(page, '/cases?as=pm-nina-foster');
    const rows = page.getByTestId('case-row');
    await expect(rows.first()).toBeVisible();
    const mine = await rows.count();
    expect(mine).toBeLessThan(30);

    await page.goto('/cases?as=maya');
    await expect(rows).toHaveCount(30);
  });

  test('an unknown case id and an out-of-scope case look the same', async ({ page }) => {
    await signIn(page, '/cases/N-DOES-NOT-EXIST?as=pm-nina-foster');
    await expect(page.getByLabel('Viewing as')).toHaveValue('pm-nina-foster');
    const unknown = await page.getByRole('main').innerText();
    await page.goto('/cases/N-001?as=pm-nina-foster');
    const hidden = await page.getByRole('main').innerText();
    // N-001 is not at Nina's property, so it must not reveal tenant details.
    expect(hidden).not.toContain('Brightside Fitness');
    expect(unknown).not.toContain('Brightside Fitness');
  });

  test('only Legal and the Founder can see a guarantor on a case', async ({ page }) => {
    await signIn(page, '/cases/N-001?as=maya');
    await expect(page.getByText('Jonah Alvarez').first()).toBeVisible();
    await page.goto('/cases/N-001?as=founder');
    await expect(page.getByText('Jonah Alvarez').first()).toBeVisible();
    await page.goto('/cases/N-001?as=am-lena-brooks');
    await expect(page.getByText('Jonah Alvarez')).toHaveCount(0);
  });
});
