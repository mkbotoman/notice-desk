import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

const log = (page: Page) => page.getByRole('list', { name: 'Case log' });
const tab = (page: Page, name: string | RegExp) => page.getByRole('tab', { name });

/**
 * The number on the Drafts tab once the app's own automatic drafts have appeared (they are raised
 * just after the page loads, so an immediate read could see zero).
 */
async function settledDrafts(page: Page): Promise<number> {
  const read = async () =>
    Number(((await tab(page, /Drafts/).innerText()).match(/\d+/) ?? ['0'])[0]);
  await expect.poll(read).toBeGreaterThan(0);
  return read();
}

const draftsTab = (page: Page, n: number) =>
  expect(tab(page, /Drafts/)).toHaveText(new RegExp(`Drafts\\s*${n}$`));

/** Saves a manual draft for `caseId` through the composer and returns once it is listed. */
async function draftFor(page: Page, caseId: string, subject: string) {
  await page.goto(`/outbox?compose=${caseId}`);
  await page.getByLabel('Subject').fill(subject);
  await page.getByRole('button', { name: 'Save as draft' }).click();
  await expect(page.getByRole('region', { name: 'Draft' })).toBeVisible();
}

test.describe('outbox', () => {
  test('?compose= opens the composer prefilled from the template', async ({ page }) => {
    await signIn(page, '/outbox?compose=N-001');
    const compose = page.getByRole('region', { name: 'Compose' });
    await expect(compose).toBeVisible();
    await expect(compose.getByLabel('Case', { exact: true })).toHaveValue('N-001');
    await expect(compose.getByLabel('Subject')).toHaveValue(/Brightside Fitness/);
    const body = compose.getByLabel('Message');
    await expect(body).toHaveValue(/Notice to Cure for Brightside Fitness/);
    await expect(body).toHaveValue(/\/cases\/N-001/);
    await expect(compose.getByText('Standard template · no AI')).toBeVisible();
    await expect(compose.getByText(/no email leaves Notice Desk/)).toBeVisible();

    await body.fill('Typed freely');
    await expect(compose.getByText('Edited by you')).toBeVisible();
    await compose.getByRole('button', { name: 'Reset to template' }).click();
    await expect(body).toHaveValue(/Notice to Cure for Brightside Fitness/);
  });

  test('edit a draft, send it, see it under Sent and in the case log, after a reload', async ({
    page,
  }) => {
    await signIn(page, '/outbox');
    const before = await settledDrafts(page);
    await draftFor(page, 'N-001', 'E2E first draft');
    await draftsTab(page, before + 1);

    const draft = page.getByRole('region', { name: 'Draft' });
    await draft.getByLabel('Subject').fill('E2E edited subject');
    await draft.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('list', { name: 'Notification list' })).toContainText(
      'E2E edited subject',
    );

    await draft.getByRole('button', { name: 'Send' }).click();
    await expect(tab(page, /Sent/)).toContainText('1');
    await draftsTab(page, before);
    const sent = page.getByRole('region', { name: 'Notification detail' });
    await expect(sent).toContainText('E2E edited subject');
    await expect(sent.getByRole('button', { name: 'Send' })).toHaveCount(0);
    await expect(sent.getByLabel('Subject')).toHaveCount(0);

    const check = async () => {
      await page.goto('/outbox');
      await tab(page, /Sent/).click();
      await expect(page.getByRole('list', { name: 'Notification list' })).toContainText(
        'E2E edited subject',
      );
      await page.goto('/cases/N-001');
      await expect(log(page)).toContainText('Notification sent');
    };
    await check();
    await page.reload();
    await check();
  });

  test('dismiss a draft; it moves to Dismissed and stays read-only', async ({ page }) => {
    await signIn(page, '/outbox');
    const before = await settledDrafts(page);
    await draftFor(page, 'N-001', 'E2E to dismiss');
    await page
      .getByRole('region', { name: 'Draft' })
      .getByRole('button', { name: 'Dismiss' })
      .click();
    await expect(tab(page, /Dismissed/)).toContainText('1');
    await draftsTab(page, before);
    await expect(page.getByRole('region', { name: 'Notification detail' })).toContainText(
      'Dismissed',
    );
    await page.reload();
    await tab(page, /Dismissed/).click();
    await expect(page.getByRole('list', { name: 'Notification list' })).toContainText(
      'E2E to dismiss',
    );
  });

  test('filters by case and recipient, and New notification starts blank', async ({ page }) => {
    await signIn(page, '/outbox');
    await draftFor(page, 'N-001', 'E2E filter one');
    await draftFor(page, 'N-004', 'E2E filter two');
    const list = page.getByRole('list', { name: 'Notification list' });
    await expect(list).toContainText('E2E filter one');
    await expect(list).toContainText('E2E filter two');

    await page.getByLabel('Filter by case').selectOption('N-004');
    await expect(list).toContainText('E2E filter two');
    await expect(list).not.toContainText('E2E filter one');
    await page.getByLabel('Filter by case').selectOption('');

    await page.getByRole('button', { name: 'New notification' }).click();
    const compose = page.getByRole('region', { name: 'Compose' });
    await expect(compose.getByLabel('Case', { exact: true })).toHaveValue('');
    await compose.getByRole('button', { name: 'Save as draft' }).click();
    await expect(compose.getByRole('alert')).toContainText('Pick a case first');
  });

  test('a composer message can be typed freely and sent directly', async ({ page }) => {
    await signIn(page, '/outbox');
    await page.getByRole('button', { name: 'New notification' }).click();
    const compose = page.getByRole('region', { name: 'Compose' });
    await compose.getByLabel('Case', { exact: true }).selectOption('N-001');
    await compose.getByLabel('Template').selectOption({ label: 'Blank' });
    await compose.getByRole('button', { name: 'Send' }).click();
    await expect(compose.getByRole('alert')).toContainText('subject and a message');
    await compose.getByLabel('Subject').fill('E2E typed freely');
    await compose.getByLabel('Message').fill('Please call the tenant.');
    await compose.getByRole('button', { name: 'Send' }).click();
    await expect(tab(page, /Sent/)).toContainText('1');
    await expect(page.getByRole('region', { name: 'Notification detail' })).toContainText(
      'Please call the tenant.',
    );
  });
});

test.describe('access and layout', () => {
  for (const persona of ['am-lena-brooks', 'founder', 'pm-rosa-alvarez']) {
    test(`${persona} cannot open the outbox`, async ({ page }) => {
      await signIn(page, `/outbox?as=${persona}`);
      await expect(page.getByText("This page isn't available in your current view")).toBeVisible();
      await expect(page.getByRole('button', { name: 'New notification' })).toHaveCount(0);
      await expect(
        page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Outbox/ }),
      ).toHaveCount(0);
    });
  }

  test('Maya sees the Outbox in the navigation', async ({ page }) => {
    await signIn(page, '/outbox');
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Outbox/ }),
    ).toBeVisible();
  });
});

test.describe('small screens', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('phone width has no horizontal overflow', async ({ page }) => {
    // The sidebar is collapsed at this width, so the nav check in signIn can fail.
    await signIn(page, '/outbox?compose=N-001').catch(() => undefined);
    await expect(page.getByRole('region', { name: 'Compose' })).toBeVisible();
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page.getByRole('region', { name: 'Draft' })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});
