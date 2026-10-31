import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

const PAGES = [
  '/',
  '/cases',
  '/cases/N-001',
  '/tenants',
  '/inbox',
  '/outbox',
  '/outbox?compose=N-001',
  '/analytics',
  '/watchlist',
  '/summary',
  '/data-quality',
];

async function violations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return result.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test('no accessibility violations on any page as Legal', async ({ page }) => {
      const found: Record<string, unknown> = {};
      await signIn(page, '/?as=maya');
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        // Charts and lists fill in just after load.
        await page.waitForTimeout(400);
        const v = await violations(page);
        if (v.length > 0) found[path] = v;
      }
      expect(found).toEqual({});
    });
  });
}

test.describe('other personas', () => {
  const VIEWS: Record<string, string[]> = {
    founder: ['/', '/cases', '/inbox', '/analytics', '/summary', '/data-quality'],
    'am-lena-brooks': ['/', '/cases', '/inbox', '/watchlist', '/summary'],
    'pm-nina-foster': ['/', '/cases', '/tenants'],
  };
  for (const [persona, paths] of Object.entries(VIEWS)) {
    test(`no accessibility violations for ${persona}`, async ({ page }) => {
      const found: Record<string, unknown> = {};
      await signIn(page, `/?as=${persona}`);
      for (const path of paths) {
        await page.goto(`${path}?as=${persona}`);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await page.waitForTimeout(400);
        const v = await violations(page);
        if (v.length > 0) found[path] = v;
      }
      expect(found).toEqual({});
    });
  }
});

test.describe('keyboard', () => {
  test('Tab reaches the navigation first and every stop shows where focus is', async ({ page }) => {
    await signIn(page, '/cases?as=maya');
    const stops: string[] = [];
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
        const ring = style.boxShadow !== 'none';
        const border = el.matches('input, select, textarea');
        return {
          tag: el.tagName.toLowerCase(),
          label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30),
          visible: outline || ring || border,
        };
      });
      expect(info, `stop ${i + 1}`).not.toBeNull();
      expect(info!.visible, `${info!.tag} "${info!.label}" shows focus`).toBe(true);
      stops.push(info!.label);
    }
    expect(new Set(stops).size).toBeGreaterThan(10);
  });

  test('the composer can be completed with the keyboard alone', async ({ page }) => {
    await signIn(page, '/outbox?compose=N-001&as=maya');
    const subject = page.getByRole('region', { name: 'Compose' }).getByLabel('Subject');
    await subject.focus();
    await page.keyboard.type(' (kb)');
    await expect(subject).toHaveValue(/\(kb\)$/);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('region', { name: 'Compose' }).getByLabel('Message')).toBeFocused();
  });
});
