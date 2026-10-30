import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

const seed = <T>(name: string): T => JSON.parse(readFileSync(`data/seed/${name}.json`, 'utf8'));
const guarantors = seed<{ name: string }[]>('guarantors');
const people = seed<{ id: string; name: string; roles: string[] }[]>('people');
const staff = new Set(people.map((p) => p.name));
const propertyManager = people.find((p) => p.roles.includes('property_manager'))!;

const summaryText = async (page: Page) => {
  await page.getByRole('button', { name: 'Plain text' }).click();
  return (await page.getByTestId('summary-text').innerText()).replace(/\r/g, '');
};

const noMarkdown = (text: string) => {
  expect(text).not.toMatch(/\*\*|#|`|\|/);
  expect(text).not.toMatch(/^\s*[-*]\s/m);
};

test.describe('weekly summary', () => {
  test('Maya sees the figures at the data date', async ({ page }) => {
    await signIn(page, '/summary');
    await expect(
      page.getByRole('heading', { name: 'Weekly summary', level: 1, exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('summary-subject')).toHaveText(
      'Notice Desk weekly summary, week ending Tue, Oct 13',
    );
    const email = page.getByTestId('summary-email');
    await expect(email.getByRole('heading', { name: 'Overdue (8)' })).toBeVisible();
    await expect(email.getByRole('heading', { name: 'Due in the next 7 days (4)' })).toBeVisible();
    await expect(email.getByRole('heading', { name: 'Stage changes (0)' })).toBeVisible();

    const text = await summaryText(page);
    expect(text).toContain('Week of Wed, Oct 7 to Tue, Oct 13');
    expect(text).toContain('Covers the whole portfolio.');
    expect(text).toContain('• 30 open cases: 21 with Legal, 9 with asset management');
    expect(text).toContain('• 8 overdue, 4 due in the next 7 days');
    expect(text).toContain('• 1 new case and 0 stage changes this week');
    expect(text).toContain('NEW THIS WEEK (1)');
    expect(text).toContain('Mon, Oct 12: ');
    expect(text).toContain('STAGE CHANGES (0)\nNone this week');
    expect(text).toContain('Live AR on the 30 open cases in view: $599,535.09.');
    expect(text).toContain('no AR history');
    expect(text).toContain('Lena Brooks: 4 cases');
    noMarkdown(text);
    for (const g of guarantors) if (!staff.has(g.name)) expect(text).not.toContain(g.name);
  });

  test('scopes to the viewer: Maya, Lena Brooks and the Founder', async ({ page }) => {
    await signIn(page, '/summary?as=am-lena-brooks');
    let text = await summaryText(page);
    expect(text).toContain('Covers the properties Lena Brooks manages.');
    expect(text).toContain('• 11 open cases: 7 with Legal, 4 with asset management');
    expect(text).toContain('Live AR on the 11 open cases in view: $167,617.92.');
    expect(text).not.toContain('Tom Reyes:');

    await page.getByLabel('Viewing as').selectOption({ value: 'founder' });
    await expect(page.getByTestId('summary-text')).toContainText('Covers the whole portfolio.');
    text = await page.getByTestId('summary-text').innerText();
    expect(text).toContain('• 30 open cases');
    expect(text).toContain('Tom Reyes: 3 cases');

    await page.getByLabel('Viewing as').selectOption({ value: 'maya' });
    await expect(page.getByTestId('summary-text')).toContainText('• 30 open cases');
  });

  test('a property manager cannot open it', async ({ page }) => {
    const slug = propertyManager.id.replace(/^PER-/, '');
    await signIn(page, `/summary?as=pm-${slug}`);
    await expect(page.getByText("This page isn't available in your current view")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy' })).toHaveCount(0);
  });

  test('changing the as-of date changes the week', async ({ page }) => {
    await signIn(page, '/summary?asOf=2026-10-20');
    await expect(page.getByTestId('summary-subject')).toHaveText(
      'Notice Desk weekly summary, week ending Tue, Oct 20',
    );
    const text = await summaryText(page);
    expect(text).toContain('Week of Wed, Oct 14 to Tue, Oct 20');
    expect(text).toContain('• 0 new cases and 0 stage changes this week');
    expect(text).toContain('NEW THIS WEEK (0)\nNone this week');
  });

  test('a stage change made in the app shows up under stage changes', async ({ page }) => {
    await signIn(page, '/cases/N-007');
    await page.getByRole('button', { name: 'Move to Default' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByLabel('Case stage')).toContainText('Default');

    await page.goto('/summary');
    const text = await summaryText(page);
    expect(text).toContain('STAGE CHANGES (1)');
    expect(text).toMatch(/Tue, Oct 13: .+, Notice to Cure to Default, by Maya/);
    expect(text).toContain('• 1 new case and 1 stage change this week');
  });

  test('Copy puts the plain text on the clipboard and announces it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signIn(page, '/summary');
    const shown = await summaryText(page);
    await page.getByRole('button', { name: 'Copy' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible();

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.replace(/\r/g, '')).toBe(shown.replace(/\r/g, '').replace(/[ \t]+$/gm, ''));
    expect(copied.startsWith('Subject: Notice Desk weekly summary, week ending Tue, Oct 13')).toBe(
      true,
    );
    noMarkdown(copied);

    const html = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      const item = items.find((i) => i.types.includes('text/html'));
      return item ? await (await item.getType('text/html')).text() : '';
    });
    expect(html).toContain('Overdue (8)');
  });

  test('works at phone width without sideways scrolling', async ({ page }) => {
    await signIn(page, '/summary');
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByTestId('summary-email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Plain text' }).click();
    await expect(page.getByTestId('summary-text')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});
