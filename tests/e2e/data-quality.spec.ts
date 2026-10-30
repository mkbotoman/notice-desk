import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

interface Issue {
  ruleId: string;
  severity: string;
  action: string;
  rowRef: string;
}
const report: Issue[] = JSON.parse(readFileSync('data/reports/data-quality.json', 'utf8'));
const countFor = (rule: string) => report.filter((i) => i.ruleId === rule).length;

// Typed out here on purpose: it is the rule list in docs/DATA_QUALITY_RULES.md, not the page's copy.
const RULES = [
  'DQ-DATE',
  'DQ-MONEY',
  'DQ-ENUM',
  'DQ-TENANT',
  'DQ-PROP',
  'DQ-ORPHAN',
  'DQ-DUP',
  'DQ-STAGE',
  'DQ-CURE',
  'DQ-AMOUNT',
  'DQ-COI',
  'DQ-COI-MISSING',
  'DQ-AR',
  'DQ-SUITE',
  'DQ-NOTE',
  'DQ-PII',
];

const rule = (page: import('@playwright/test').Page, id: string) =>
  page.locator(`section[data-rule="${id}"]`);

test.describe('data quality page', () => {
  test('the report has the numbers the docs describe', () => {
    expect(report).toHaveLength(187);
    expect(countFor('DQ-DATE')).toBe(138);
  });

  test('lists every rule, including the ones that found nothing, with matching counts', async ({
    page,
  }) => {
    await signIn(page, '/data-quality');
    await expect(page.locator('section[data-rule]')).toHaveCount(RULES.length);
    for (const id of RULES) {
      const section = rule(page, id);
      await expect(section).toBeVisible();
      await expect(section).toContainText('Checks:');
      const n = countFor(id);
      if (n === 0) {
        await expect(section).toContainText('Checked, nothing found');
      } else {
        await expect(section.getByTestId(`count-${id}`)).toHaveText(
          `${n} ${n === 1 ? 'issue' : 'issues'}`,
        );
      }
    }
    for (const id of ['DQ-AR', 'DQ-AMOUNT', 'DQ-STAGE', 'DQ-DUP', 'DQ-NOTE', 'DQ-PII']) {
      await expect(rule(page, id)).toContainText('Checked, nothing found');
    }
  });

  test('opens with a plain-words summary of real counts', async ({ page }) => {
    await signIn(page, '/data-quality');
    const summary = page.getByTestId('dq-summary');
    await expect(summary).toContainText('174 leases');
    await expect(summary).toContainText('74 tenants (2 name variants merged)');
    await expect(summary).toContainText('187 entries');
    const review = report.filter((i) => i.severity !== 'info').length;
    await expect(summary).toContainText(`${report.length - review} routine repairs`);
    await expect(summary).toContainText(`${review} flagged for review`);
  });

  test('links leases to tenants and notices to cases, but not rows or properties', async ({
    page,
  }) => {
    await signIn(page, '/data-quality');
    const orphan = rule(page, 'DQ-ORPHAN');
    await expect(orphan.getByRole('link', { name: 'L-0273' })).toHaveAttribute(
      'href',
      '/tenants/T-silverstone-vapor',
    );

    const prop = rule(page, 'DQ-PROP');
    await expect(prop.getByRole('link', { name: 'N-002' })).toHaveAttribute('href', '/cases/N-002');
    await prop.getByRole('link', { name: 'N-002' }).click();
    await expect(page).toHaveURL(/\/cases\/N-002$/);

    await page.goBack();
    const coi = rule(page, 'DQ-COI');
    await expect(coi.getByText('row 54')).toBeVisible();
    await expect(coi.getByRole('link')).toHaveCount(0);
  });

  test('shows before and after values', async ({ page }) => {
    await signIn(page, '/data-quality');
    const cure = rule(page, 'DQ-CURE');
    await cure.getByRole('button', { name: /Show 14 issues/ }).click();
    const first = cure.getByRole('listitem').first();
    await expect(first).toContainText('15 days');
    await expect(first).toContainText('15 calendar days');
  });

  test('keeps a long rule collapsed and pages through it', async ({ page }) => {
    await signIn(page, '/data-quality');
    const date = rule(page, 'DQ-DATE');
    const toggle = date.getByRole('button', { name: /Show 138 issues/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(date.getByRole('listitem')).toHaveCount(0);
    await toggle.click();
    await expect(date.getByRole('listitem')).toHaveCount(20);
    await date.getByRole('button', { name: /Show 20 more/ }).click();
    await expect(date.getByRole('listitem')).toHaveCount(40);
    await page.getByRole('button', { name: /Hide 138 issues/ }).click();
    await expect(date.getByRole('listitem')).toHaveCount(0);
  });

  test('filters by severity and by action', async ({ page }) => {
    await signIn(page, '/data-quality');
    await page.getByLabel('Severity').selectOption('warning');
    // Everything on the date rule is routine, so nothing is left to show.
    await expect(rule(page, 'DQ-DATE').getByRole('button')).toHaveText('Show 0 of 138 issues');
    await expect(rule(page, 'DQ-COI').getByRole('listitem')).toHaveCount(2);
    await expect(rule(page, 'DQ-MONEY').getByRole('listitem')).toHaveCount(2);

    await page.getByLabel('Action taken').selectOption('fixed');
    await expect(rule(page, 'DQ-COI')).toContainText('No issues match the filters');
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(rule(page, 'DQ-COI').getByRole('listitem')).toHaveCount(2);

    await page.getByLabel('Action taken').selectOption('fixed');
    await expect(rule(page, 'DQ-TENANT').getByRole('listitem')).toHaveCount(2);
    await expect(rule(page, 'DQ-PROP')).toContainText('No issues match the filters');
  });

  test('is open to Legal and the Founder only', async ({ page }) => {
    await signIn(page, '/data-quality?as=maya');
    await expect(page.getByRole('heading', { name: 'Data quality', level: 1 })).toBeVisible();
    await expect(rule(page, 'DQ-DATE')).toBeVisible();

    await page.goto('/data-quality?as=founder');
    await expect(rule(page, 'DQ-DATE')).toBeVisible();

    for (const as of ['am-lena-brooks', 'pm-leo-ward']) {
      await page.goto(`/data-quality?as=${as}`);
      await expect(page.getByText("This page isn't available in your current view")).toBeVisible();
      await expect(page.locator('section[data-rule]')).toHaveCount(0);
    }
  });

  test('fits a phone screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // The nav collapses on a phone, so the helper's nav check does not apply.
    await signIn(page, '/data-quality').catch(() => undefined);
    await expect(page.locator('section[data-rule]').first()).toBeVisible();
    await rule(page, 'DQ-ORPHAN').scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
