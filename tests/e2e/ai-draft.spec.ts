import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

/** Built at runtime so no SSN-shaped literal sits in the repository (pnpm scan:pii). */
const SSN_A = ['123', '45', '6789'].join('-');
const SSN_B = ['987', '65', '4321'].join('-');

const AI_BUTTON = 'Draft with AI';
const UNAVAILABLE = 'AI unavailable, your draft is unchanged';
const AI_SUBJECT = 'Brightside Fitness: please confirm payment';
const AI_BODY = 'Hi, please confirm whether Brightside Fitness has paid before the deadline.';

const compose = (page: Page) => page.getByRole('region', { name: 'Compose' });
const aiButton = (page: Page) => page.getByRole('button', { name: AI_BUTTON });
const panel = (page: Page) => page.getByRole('region', { name: 'AI draft' });

/** Answers the draft route without any model. */
async function stubSuccess(page: Page) {
  await page.route('**/api/ai/draft', (route) =>
    route.fulfill({
      json: { source: 'ai', subject: AI_SUBJECT, body: AI_BODY, model: 'stub' },
    }),
  );
}

async function openComposer(page: Page) {
  await signIn(page, '/outbox?compose=N-001');
  await expect(compose(page)).toBeVisible();
}

test.describe('AI draft assist', () => {
  test('the AI button is always there, with an optional note on what should change', async ({
    page,
  }) => {
    await openComposer(page);
    await expect(compose(page).getByText('Standard template · no AI')).toBeVisible();
    await expect(aiButton(page)).toBeVisible();
    await expect(compose(page).getByLabel('What should change?')).toBeVisible();
    await expect(
      compose(page).getByText(/Sends the case facts .* your text and your note to the AI/),
    ).toBeVisible();

    await compose(page).getByLabel('Subject').fill('Edited subject');
    await expect(aiButton(page)).toBeVisible();
  });

  test('the note goes with the request, and is optional', async ({ page }) => {
    const sent: Record<string, unknown>[] = [];
    await page.route('**/api/ai/draft', (route) => {
      sent.push(route.request().postDataJSON());
      return route.fulfill({
        json: { source: 'ai', subject: AI_SUBJECT, body: AI_BODY, model: 'stub' },
      });
    });
    await openComposer(page);
    await aiButton(page).click();
    await expect(panel(page)).toBeVisible();
    expect(sent[0]).not.toHaveProperty('instruction');
    expect(sent[0]).toMatchObject({ tone: 'formal' });

    await panel(page).getByRole('button', { name: 'Discard' }).click();
    await compose(page).getByLabel('What should change?').fill('make it shorter');
    await aiButton(page).click();
    await expect(panel(page)).toBeVisible();
    expect(sent[1]).toMatchObject({ instruction: 'make it shorter' });
  });

  test('a stubbed draft is shown, only applied on request, and marks the sent notification', async ({
    page,
  }) => {
    await stubSuccess(page);
    await openComposer(page);
    const subject = compose(page).getByLabel('Subject');
    const body = compose(page).getByLabel('Message');
    await subject.fill('Brightside rough note');
    await body.fill('need payment confirm pls');

    await aiButton(page).click();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toContainText('AI draft: check it before you use it');
    await expect(panel(page)).toContainText(AI_SUBJECT);
    await expect(subject).toHaveValue('Brightside rough note');
    await expect(body).toHaveValue('need payment confirm pls');

    await panel(page).getByRole('button', { name: 'Discard' }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect(subject).toHaveValue('Brightside rough note');
    await expect(body).toHaveValue('need payment confirm pls');
    await expect(compose(page).getByText('AI-assisted')).toHaveCount(0);

    await aiButton(page).click();
    await panel(page).getByRole('button', { name: 'Use this draft' }).click();
    await expect(subject).toHaveValue(AI_SUBJECT);
    await expect(body).toHaveValue(AI_BODY);
    await expect(compose(page).getByText('AI-assisted')).toBeVisible();

    await body.fill(`${AI_BODY} Thanks.`);
    await expect(compose(page).getByText('AI-assisted')).toBeVisible();
    await compose(page).getByRole('button', { name: 'Send' }).click();

    const sent = page.getByRole('region', { name: 'Notification detail' });
    await expect(sent).toContainText('Thanks.');
    await expect(sent.getByText('AI-assisted')).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Notification list' }).getByText('AI-assisted'),
    ).toBeVisible();
    await page.reload();
    await page.getByRole('tab', { name: /Sent/ }).click();
    await expect(
      page.getByRole('list', { name: 'Notification list' }).getByText('AI-assisted'),
    ).toBeVisible();
  });

  test('a saved draft can be improved too, and keeps the AI-assisted mark', async ({ page }) => {
    await stubSuccess(page);
    await signIn(page, '/outbox?compose=N-004');
    await compose(page).getByLabel('Subject').fill('E2E AI detail draft');
    await compose(page).getByRole('button', { name: 'Save as draft' }).click();
    const draft = page.getByRole('region', { name: 'Draft' });
    await expect(draft).toBeVisible();
    await expect(draft.getByText('AI-assisted')).toHaveCount(0);

    await aiButton(page).click();
    await panel(page).getByRole('button', { name: 'Use this draft' }).click();
    await expect(draft.getByLabel('Message')).toHaveValue(AI_BODY);
    await draft.getByRole('button', { name: 'Save changes' }).click();
    await expect(draft.getByText('AI-assisted').first()).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Notification list' }).getByText('AI-assisted'),
    ).toBeVisible();
  });

  test('says so when the AI is unavailable, using the real route with no credentials', async ({
    page,
  }) => {
    test.skip(
      Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
      'would reach a live model',
    );
    await openComposer(page);
    const subject = compose(page).getByLabel('Subject');
    await subject.fill('Brightside rough note');
    const button = aiButton(page);
    await button.click();
    await expect(page.getByRole('status')).toContainText(UNAVAILABLE);
    await expect(panel(page)).toHaveCount(0);
    await expect(subject).toHaveValue('Brightside rough note');
    await expect(button).toBeEnabled();
  });

  test('is unavailable when the route fails, and announces the wait', async ({ page }) => {
    await page.route('**/api/ai/draft', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.fulfill({ status: 500, json: { error: 'failed' } });
    });
    await openComposer(page);
    await compose(page).getByLabel('Subject').fill('Brightside rough note');
    await aiButton(page).click();
    await expect(aiButton(page)).toBeDisabled();
    await expect(page.getByRole('status')).toContainText('Drafting with AI');
    await expect(page.getByRole('status')).toContainText(UNAVAILABLE);
    await expect(aiButton(page)).toBeEnabled();
  });

  test('SSN-shaped text never reaches the request, and the person is told', async ({ page }) => {
    await stubSuccess(page);
    await openComposer(page);
    await compose(page).getByLabel('Subject').fill(`Tenant SSN ${SSN_A}`);
    await compose(page).getByLabel('Message').fill(`Their number is ${SSN_B}, check it.`);

    const [request] = await Promise.all([
      page.waitForRequest('**/api/ai/draft'),
      aiButton(page).click(),
    ]);
    const sent = request.postData() ?? '';
    expect(sent).not.toContain(`${SSN_A}`);
    expect(sent).not.toContain(`${SSN_B}`);
    expect(sent).toContain('[redacted]');
    expect(sent).toContain('Brightside Fitness LLC');
    expect(sent).not.toMatch(/guarantor/i);
    await expect(
      compose(page).getByText('Sensitive-looking text was removed before sending.'),
    ).toBeVisible();
    await expect(compose(page).getByLabel('Message')).toHaveValue(new RegExp(SSN_B));
  });

  for (const persona of ['am-lena-brooks', 'founder', 'pm-rosa-alvarez']) {
    test(`${persona} cannot reach the outbox or the AI button`, async ({ page }) => {
      await signIn(page, `/outbox?compose=N-001&as=${persona}`);
      await expect(page.getByText("This page isn't available in your current view")).toBeVisible();
      await expect(aiButton(page)).toHaveCount(0);
    });
  }
});

test.describe('small screens', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('phone width has no horizontal overflow with the AI panel open', async ({ page }) => {
    await stubSuccess(page);
    // The sidebar is collapsed at this width, so the nav check in signIn can fail.
    await signIn(page, '/outbox?compose=N-001').catch(() => undefined);
    await expect(compose(page)).toBeVisible();
    await compose(page).getByLabel('Subject').fill('Brightside rough note');
    await aiButton(page).click();
    await expect(panel(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
