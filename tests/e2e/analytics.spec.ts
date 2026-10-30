import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

const chart = (page: Page, id: string) => page.getByTestId(`chart-${id}`);
const kpi = (page: Page, id: string) => page.getByTestId(`kpi-${id}`);

const CHART_IDS = [
  'stages',
  'sent',
  'workload',
  'managers',
  'ar-property',
  'ar-fund',
  'activity',
  'tenant-cases',
  'tenant-ar',
  'repeat',
];

async function openTable(page: Page, id: string) {
  const card = chart(page, id);
  const summary = card.getByText('Data table', { exact: true });
  if (await summary.count()) await summary.click();
  return card.getByRole('table');
}

test.describe('headline figures at the data date', () => {
  test('Legal sees the whole portfolio', async ({ page }) => {
    await signIn(page, '/analytics');
    await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible();
    await expect(kpi(page, 'open')).toContainText('30');
    await expect(kpi(page, 'open')).toContainText('of 37 cases');
    await expect(kpi(page, 'overdue')).toContainText('8');
    await expect(kpi(page, 'week')).toContainText('4');
    await expect(kpi(page, 'cure')).toContainText('57%');
    await expect(kpi(page, 'cure')).toContainText('4 cured, 3 closed');
    await expect(kpi(page, 'ar')).toContainText('$599,535.09');
    await expect(page.getByTestId('cure-note')).toContainText('Only 7 cases have been resolved');
  });

  test('stage, month and fund charts carry the real numbers and their date coverage', async ({
    page,
  }) => {
    await signIn(page, '/analytics');
    await expect(chart(page, 'sent')).toContainText('Feb 12 to Oct 12, 2026');
    await expect(chart(page, 'sent')).toContainText('5 cases without a send date left out');

    const stages = await openTable(page, 'stages');
    await expect(stages.getByRole('row', { name: /Notice to Cure\s+14/ })).toBeVisible();
    await expect(stages.getByRole('row', { name: /Default\s+7/ })).toBeVisible();
    await expect(stages.getByRole('row', { name: /Non-compliant\s+5/ })).toBeVisible();
    await expect(stages.getByRole('row', { name: /Collections\s+4/ })).toBeVisible();

    const months = await openTable(page, 'sent');
    await expect(months.getByRole('row', { name: /Sep\s+11/ })).toBeVisible();

    const funds = await openTable(page, 'ar-fund');
    await expect(
      funds.getByRole('row', { name: /Income REIT\s+17\s+\$359,954\.13/ }),
    ).toBeVisible();
    await expect(funds.getByRole('row', { name: /Fund II\s+13\s+\$239,580\.96/ })).toBeVisible();

    const teams = await openTable(page, 'workload');
    await expect(teams.getByRole('row', { name: /Legal\s+21\s+5/ })).toBeVisible();
    await expect(teams.getByRole('row', { name: /Asset Mgmt\s+9\s+3/ })).toBeVisible();
    const managers = await openTable(page, 'managers');
    await expect(managers.getByRole('row', { name: /Lena Brooks\s+4\s+2/ })).toBeVisible();
  });

  test('says plainly that there is no stage history', async ({ page }) => {
    await signIn(page, '/analytics');
    const note = page.getByTestId('no-history-note');
    await expect(note).toContainText('History starts when changes are made in the app');
    await expect(note).toContainText('no stage history');
    await expect(page.getByText('Median days in each stage')).toHaveCount(0);
  });

  test('every chart has a data table equivalent', async ({ page }) => {
    await signIn(page, '/analytics');
    for (const id of CHART_IDS) {
      await expect(chart(page, id), id).toBeVisible();
    }
    for (const id of CHART_IDS.filter((c) => c !== 'activity')) {
      await expect(await openTable(page, id), id).toBeVisible();
    }
    // Activity is empty until someone works in the app; it explains itself instead.
    await expect(chart(page, 'activity')).toContainText('Nothing yet');
  });
});

test.describe('tenant view', () => {
  test('rows link to the tenant page', async ({ page }) => {
    await signIn(page, '/analytics');
    const link = chart(page, 'tenant-ar').getByRole('link', { name: 'Juniper Kids Dental' });
    await expect(link).toHaveAttribute('href', '/tenants/T-juniper-kids-dental');
    const repeat = chart(page, 'repeat');
    await expect(repeat.getByRole('link', { name: 'Hearthstone Pizza' })).toHaveAttribute(
      'href',
      '/tenants/T-hearthstone-pizza',
    );
    await expect(repeat.getByRole('row', { name: /Hearthstone Pizza\s+2\s+2\s+2/ })).toBeVisible();
    await repeat.getByRole('link', { name: 'Hearthstone Pizza' }).click();
    await expect(page).toHaveURL(/\/tenants\/T-hearthstone-pizza$/);
  });
});

test.describe('who sees what', () => {
  test('an asset manager sees a smaller slice than Legal', async ({ page }) => {
    await signIn(page, '/analytics?as=am-lena-brooks');
    await expect(kpi(page, 'open')).toContainText('11');
    await expect(kpi(page, 'open')).toContainText('of 12 cases');
    await expect(kpi(page, 'ar')).toContainText('$167,617.92');
    await expect(kpi(page, 'ar')).not.toContainText('$599,535.09');
    const managers = await openTable(page, 'managers');
    await expect(managers.getByRole('row')).toHaveCount(2);
    await expect(managers).not.toContainText('Tom Reyes');
  });

  test('the Founder can open it and sees everything', async ({ page }) => {
    await signIn(page, '/analytics?as=founder');
    await expect(kpi(page, 'open')).toContainText('30');
    await expect(kpi(page, 'ar')).toContainText('$599,535.09');
  });

  for (const id of ['pm-nina-foster', 'pm-leo-ward', 'pm-rosa-alvarez', 'pm-victor-hughes']) {
    test(`${id} cannot open the page`, async ({ page }) => {
      await signIn(page, `/analytics?as=${id}`);
      await expect(page.getByText("This page isn't available in your current view")).toBeVisible();
      await expect(page.getByTestId('no-history-note')).toHaveCount(0);
      await expect(page.getByTestId('kpi-open')).toHaveCount(0);
    });
  }
});

test.describe('activity fills in as people use the app', () => {
  test('a note shows up in the weekly activity chart', async ({ page }) => {
    await signIn(page, '/cases/N-007');
    await page.getByLabel('Add an update').fill('Called the tenant');
    await page.getByRole('button', { name: 'Add update' }).click();
    await expect(page.getByRole('list', { name: 'Case log' })).toContainText('Called the tenant');

    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: /Analytics/ })
      .click();
    await expect(chart(page, 'activity')).toContainText('1 action');
    const table = await openTable(page, 'activity');
    await expect(table.getByRole('row')).toHaveCount(2);
  });
});

test.describe('small screens', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('has no horizontal scroll, even with every table open', async ({ page }) => {
    // The main navigation is collapsed at phone width, so signIn's final check can't see it.
    await signIn(page, '/analytics').catch(() => undefined);
    await expect(chart(page, 'repeat')).toBeVisible();
    for (const id of CHART_IDS.filter((c) => c !== 'activity')) await openTable(page, id);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
