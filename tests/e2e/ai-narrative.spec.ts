import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

const AI_TEXT =
  'One new case came in this week and nothing moved stage. 30 cases are open, with 8 overdue and 4 due in the next 7 days.';

const stubAi = (
  page: Page,
  body: Record<string, unknown> = { source: 'ai', text: AI_TEXT, model: 'stub' },
) => page.route('**/api/ai/narrative', (route) => route.fulfill({ json: body }));

const paragraph = (page: Page) => page.getByLabel('Paragraph for the email');

const clipboardText = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

const writeWithAi = async (page: Page) => {
  await page.getByRole('button', { name: 'Write with AI' }).click();
  await expect(page.getByText('AI draft: check it before you send')).toBeVisible();
};

test.describe('AI narrative', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test('shows the standard paragraph by default and never calls the model on load', async ({
    page,
  }) => {
    let calls = 0;
    await page.route('**/api/ai/narrative', (route) => {
      calls += 1;
      return route.abort();
    });
    await signIn(page, '/summary');
    await expect(page.getByText('Standard summary', { exact: true })).toBeVisible();
    await expect(paragraph(page)).toHaveValue(
      /30 cases are open: 21 with Legal and 9 with asset management/,
    );
    await expect(paragraph(page)).toHaveValue(/\$599,535\.09/);
    expect(calls).toBe(0);

    const panel = page.getByRole('region', { name: 'What changed this week' });
    const glance = page.getByTestId('summary-email').getByRole('heading', { name: 'At a glance' });
    expect((await panel.boundingBox())!.y).toBeLessThan((await glance.boundingBox())!.y);
  });

  test('Write with AI shows the labelled draft without putting it in the email', async ({
    page,
  }) => {
    await stubAi(page);
    await signIn(page, '/summary');
    await writeWithAi(page);
    await expect(paragraph(page)).toHaveValue(AI_TEXT);
    await expect(page.getByTestId('summary-email')).not.toContainText('One new case came in');
  });

  test('falls back to the standard summary when the model is unavailable', async ({ page }) => {
    await signIn(page, '/summary');
    await page.getByRole('button', { name: 'Write with AI' }).click();
    await expect(page.getByText('AI unavailable, used the standard summary')).toBeVisible();
    await expect(paragraph(page)).toHaveValue(/30 cases are open/);
    await expect(page.getByRole('status').filter({ hasText: 'AI unavailable' })).toBeVisible();
  });

  test('also falls back when the request itself fails', async ({ page }) => {
    await page.route('**/api/ai/narrative', (route) => route.abort());
    await signIn(page, '/summary');
    await page.getByRole('button', { name: 'Write with AI' }).click();
    await expect(page.getByText('AI unavailable, used the standard summary')).toBeVisible();
  });

  test('accepting puts the paragraph in the email view and the copied text', async ({ page }) => {
    await stubAi(page);
    await signIn(page, '/summary');
    await writeWithAi(page);
    await page.getByRole('button', { name: 'Use this paragraph' }).click();

    const email = page.getByTestId('summary-email');
    await expect(email.getByRole('heading', { name: 'What changed this week' })).toBeVisible();
    await expect(email).toContainText(AI_TEXT);

    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible();
    const copied = await clipboardText(page);
    expect(copied).toContain('WHAT CHANGED THIS WEEK\n' + AI_TEXT);
    expect(copied.indexOf('WHAT CHANGED')).toBeLessThan(copied.indexOf('AT A GLANCE'));
    expect(copied).not.toMatch(/\*\*|#|`|\|/);
    const html = await page.evaluate(async () => {
      const item = (await navigator.clipboard.read()).find((i) => i.types.includes('text/html'));
      return item ? await (await item.getType('text/html')).text() : '';
    });
    expect(html).toContain(AI_TEXT);

    await page.getByRole('button', { name: 'Plain text' }).click();
    await expect(page.getByTestId('summary-text')).toContainText(AI_TEXT);
  });

  test('an unaccepted draft is never copied', async ({ page }) => {
    await stubAi(page);
    await signIn(page, '/summary');
    await writeWithAi(page);
    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible();
    const copied = await clipboardText(page);
    expect(copied).not.toContain('One new case came in');
    expect(copied).not.toContain('WHAT CHANGED THIS WEEK');
  });

  test('editing then accepting copies the edited text; going back to standard drops it', async ({
    page,
  }) => {
    await stubAi(page);
    await signIn(page, '/summary');
    await writeWithAi(page);
    await paragraph(page).fill('Edited by hand: 8 cases are overdue.');
    await page.getByRole('button', { name: 'Use this paragraph' }).click();
    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible();
    expect(await clipboardText(page)).toContain(
      'WHAT CHANGED THIS WEEK\nEdited by hand: 8 cases are overdue.',
    );

    await page.getByRole('button', { name: 'Back to standard summary' }).click();
    await expect(page.getByText('Standard summary', { exact: true })).toBeVisible();
    await expect(page.getByTestId('summary-email')).not.toContainText('Edited by hand');
    await expect(page.getByRole('button', { name: 'Use this paragraph' })).toBeVisible();
  });

  test('the paragraph resets when the as-of date or the viewer changes', async ({ page }) => {
    await stubAi(page);
    await signIn(page, '/summary');
    await writeWithAi(page);
    await page.getByRole('button', { name: 'Use this paragraph' }).click();
    await expect(page.getByTestId('summary-email')).toContainText(AI_TEXT);

    await page.getByLabel('Viewing as').selectOption({ value: 'founder' });
    await expect(page.getByTestId('summary-email')).not.toContainText(AI_TEXT);
    await expect(page.getByText('Standard summary', { exact: true })).toBeVisible();

    await page.goto('/summary?asOf=2026-10-13');
    await writeWithAi(page);
    await page.goto('/summary?asOf=2026-10-20');
    await expect(page.getByText('Standard summary', { exact: true })).toBeVisible();
    await expect(paragraph(page)).toHaveValue(/Nothing changed|no new cases/);
  });

  test('has no horizontal overflow at 390px', async ({ page }) => {
    await stubAi(page);
    await signIn(page, '/summary');
    await page.setViewportSize({ width: 390, height: 844 });
    await writeWithAi(page);
    await page.getByRole('button', { name: 'Use this paragraph' }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
