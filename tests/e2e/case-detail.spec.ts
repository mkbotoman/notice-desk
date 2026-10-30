import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

const guarantorFor = (caseId: string): string => {
  const rows: { caseId: string; name: string }[] = JSON.parse(
    readFileSync('data/seed/guarantors.json', 'utf8'),
  );
  return rows.find((r) => r.caseId === caseId)!.name;
};

const buttons = (page: Page) => page.getByRole('group', { name: 'Case actions' });
const log = (page: Page) => page.getByRole('list', { name: 'Case log' });

test.describe('case facts', () => {
  test('N-001 shows its facts and explains the deadline in words', async ({ page }) => {
    await signIn(page, '/cases/N-001');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Brightside');
    await expect(page.getByRole('link', { name: 'View tenant' })).toHaveAttribute(
      'href',
      /\/tenants\/T-brightside-fitness$/,
    );
    const box = page.getByTestId('deadline-box');
    await expect(box).toContainText('Tue, Oct 13, 2026');
    await expect(box).toContainText('10 business days from Mon, Sep 28 gives Tue, Oct 13');
    await expect(box).toContainText('Columbus Day (Mon, Oct 12)');
    await expect(page.getByLabel('Case stage')).toContainText('Notice to Cure');
    await expect(page.getByText('due today')).toBeVisible();
    await expect(page.getByText('Sent', { exact: true })).toBeVisible();
    await expect(page.getByText('tenant asked for payment plan')).toBeVisible();
    await expect(page.getByText("Imported from Legal's sheet")).toBeVisible();
  });

  test('an unknown id shows the not-found state', async ({ page }) => {
    await signIn(page, '/cases/N-999');
    await expect(page.getByText("We couldn't find that case")).toBeVisible();
  });
});

test.describe('Legal actions', () => {
  test('Maya advances a case and adds an update; both survive a reload', async ({ page }) => {
    await signIn(page, '/cases/N-007');
    await page.getByRole('button', { name: 'Move to Default' }).click();
    await page.getByLabel('Note (optional)').fill('Cure period lapsed <b>unpaid</b>');
    await page.getByRole('button', { name: 'Confirm' }).click();

    await page.getByLabel('Add an update').fill('Called the tenant');
    await page.getByRole('button', { name: 'Add update' }).click();

    const check = async () => {
      await expect(page.getByLabel('Case stage').locator('[aria-current="step"]')).toContainText(
        'Default',
      );
      await expect(log(page)).toContainText('Moved from Notice to Cure to Default');
      await expect(log(page)).toContainText('Cure period lapsed <b>unpaid</b>');
      await expect(log(page)).toContainText('Called the tenant');
      await expect(log(page)).toContainText('Maya · Legal');
    };
    await check();
    await page.reload();
    await check();
  });

  test('a stage change needs a confirm step, and cancel changes nothing', async ({ page }) => {
    await signIn(page, '/cases/N-007');
    await page.getByRole('button', { name: 'Mark cured' }).click();
    await expect(page.getByText('Move this case from Notice to Cure to Cured?')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByLabel('Confirm change')).toHaveCount(0);
    await expect(log(page)).not.toContainText('Moved from');
  });

  test('an empty update shows the error from the action', async ({ page }) => {
    await signIn(page, '/cases/N-007');
    await page.getByRole('button', { name: 'Add update' }).click();
    await expect(page.getByText('An update needs some text')).toBeVisible();
  });

  test('Maya hands a case to Asset Management and it shows in the log', async ({ page }) => {
    await signIn(page, '/cases/N-007');
    await page.getByRole('button', { name: 'Hand to Asset Management' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await page.reload();
    await expect(log(page)).toContainText('Owner changed from Legal to Asset Management');
    await expect(page.getByText('Waiting on Asset Mgmt')).toBeVisible();
  });

  test('Draft a notification links to the outbox for Legal only', async ({ page }) => {
    await signIn(page, '/cases/N-007');
    await expect(page.getByRole('link', { name: 'Draft a notification' })).toHaveAttribute(
      'href',
      '/outbox?compose=N-007',
    );
  });

  test('a finished case offers no transitions or owner change', async ({ page }) => {
    await signIn(page, '/cases/N-008');
    await expect(page.getByLabel('Case stage')).toContainText('Cured');
    await expect(
      page.getByRole('button', { name: /^(Move to|Mark cured|Close case)/ }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Hand|Take back/ })).toHaveCount(0);
    await expect(page.getByText('Nobody (case finished)')).toBeVisible();
  });
});

test.describe('other personas', () => {
  test('an asset manager can hand back and update her own case, but not advance', async ({
    page,
  }) => {
    await signIn(page, '/cases/N-002?as=am-lena-brooks');
    await expect(page.getByRole('button', { name: 'Hand back to Legal' })).toBeVisible();
    await expect(page.getByLabel('Add an update')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^(Move to|Mark cured|Close case)/ }),
    ).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Draft a notification' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Hand back to Legal' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(log(page)).toContainText('Owner changed from Asset Management to Legal');
    await expect(page.getByRole('button', { name: 'Hand back to Legal' })).toHaveCount(0);
    await expect(page.getByLabel('Add an update')).toBeVisible();
  });

  test('an asset manager cannot hand back a case Legal owns', async ({ page }) => {
    await signIn(page, '/cases/N-007?as=am-lena-brooks');
    await expect(page.getByLabel('Add an update')).toBeVisible();
    await expect(page.getByRole('button', { name: /Hand|Take back/ })).toHaveCount(0);
  });

  test('a case outside her properties is not shown to her', async ({ page }) => {
    await signIn(page, '/cases/N-001?as=am-lena-brooks');
    await expect(page.getByText("This case isn't available in your current view")).toBeVisible();
    await expect(page.getByText('Brightside')).toHaveCount(0);
  });

  test('read-only personas see no controls', async ({ page }) => {
    await signIn(page, '/cases/N-001?as=pm-rosa-alvarez');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Brightside');
    await expect(page.getByRole('button', { name: /Move to|Hand|Add update/ })).toHaveCount(0);
    await expect(page.getByLabel('Add an update')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Draft a notification' })).toHaveCount(0);

    await page.getByLabel('Viewing as').selectOption({ value: 'founder' });
    await expect(page.getByLabel('Add an update')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Draft a notification' })).toHaveCount(0);
    await expect(buttons(page)).toHaveCount(0);
  });
});

test.describe('guarantor', () => {
  test('is visible to Maya and the Founder only', async ({ page }) => {
    const name = guarantorFor('N-002');
    await signIn(page, '/cases/N-002');
    await expect(page.getByText(name)).toBeVisible();

    await page.getByLabel('Viewing as').selectOption({ value: 'founder' });
    await expect(page.getByText(name)).toBeVisible();

    await page.getByLabel('Viewing as').selectOption({ value: 'am-lena-brooks' });
    await expect(page.getByText('Guarantor details are restricted')).toBeVisible();
    await expect(page.getByText(name)).toHaveCount(0);
    expect(await page.locator('main').innerText()).not.toContain(name);

    await page.getByLabel('Viewing as').selectOption({ value: 'pm-rosa-alvarez' });
    await expect(page.getByText(name)).toHaveCount(0);
  });
});
