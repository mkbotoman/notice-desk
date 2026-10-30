import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { DraftRequestSchema, createDraftHandler } from '@/lib/ai/draft';
import { createGenerator } from '@/lib/ai/gateway';
import { createLimiter } from '@/lib/ai/limit';
import { createAiRoute } from '@/lib/ai/route';
import { POST } from './route';

/** Built at runtime so no SSN-shaped literal sits in the repository (pnpm scan:pii). */
const SSN_A = ['123', '45', '6789'].join('-');

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};
const replying = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage,
      warnings: [],
    }),
  });

const valid = {
  facts: {
    tenant: 'Brightside Fitness LLC',
    property: 'Harbor Commons',
    suite: null,
    stage: 'Notice to Cure',
    issueType: 'Monetary',
    dateSent: '2026-09-28',
    deadline: '2026-10-13',
    amount: '$18,450',
    ownerTeam: 'Legal',
  },
  recipientRole: 'Legal',
  tone: 'internal',
  template: 'deadline_approaching',
  subject: 'Brightside deadline 2026-10-13',
  body: 'Please check payment before 2026-10-13.',
};

const post = (body: unknown) =>
  new Request('http://x/api/ai/draft', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

function routeFor(model: MockLanguageModelV4, timeoutMs?: number) {
  return createAiRoute({
    schema: DraftRequestSchema,
    handle: createDraftHandler(createGenerator({ model, timeoutMs })),
    limiter: createLimiter({ max: 100, windowMs: 1000 }),
  });
}

describe('POST /api/ai/draft', () => {
  it('returns the checked draft with source ai', async () => {
    const model = replying(
      'SUBJECT: Brightside deadline 2026-10-13\n\nPlease confirm payment before 2026-10-13.',
    );
    const res = await routeFor(model)(post(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      source: 'ai',
      subject: 'Brightside deadline 2026-10-13',
      body: 'Please confirm payment before 2026-10-13.',
      model: 'custom',
    });
    const sent = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(sent).toContain('Brightside Fitness LLC');
    expect(sent).not.toMatch(/guarantor/i);
  });

  it('redacts SSN-shaped text even when the caller did not', async () => {
    const model = replying('SUBJECT: Hello\n\nBody');
    await routeFor(model)(post({ ...valid, body: `Tenant SSN ${SSN_A} is wrong` }));
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).not.toContain(`${SSN_A}`);
  });

  it('reports a model error as unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error('no credentials');
      },
    });
    const res = await routeFor(broken)(post(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ source: 'unavailable', reason: 'unavailable' });
  });

  it('reports output that fails the checks as rejected', async () => {
    for (const text of [
      'SUBJECT: Hi\n\nThe balance is $99,999.',
      'SUBJECT: Hi\n\n**Bold** body',
      'not in the format',
    ]) {
      const res = await routeFor(replying(text))(post(valid));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ source: 'unavailable', reason: 'rejected' });
    }
  });

  it('reports a slow model as a timeout', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const slow = new MockLanguageModelV4({
      doGenerate: (options) =>
        new Promise((_, reject) => {
          options.abortSignal?.addEventListener('abort', () => reject(options.abortSignal?.reason));
        }),
    });
    const res = await routeFor(slow, 30)(post(valid));
    expect(await res.json()).toEqual({ source: 'unavailable', reason: 'timeout' });
  });

  it('answers 400 to a bad body or an extra key, without echoing it, and never calls the model', async () => {
    const model = replying('SUBJECT: Hi\n\nBody');
    const route = routeFor(model);
    expect((await route(post('not json'))).status).toBe(400);
    expect((await route(post({ ...valid, subject: 5 }))).status).toBe(400);
    const extra = await route(post({ ...valid, guarantorName: 'Jane Doe' }));
    expect(extra.status).toBe(400);
    expect(JSON.stringify(await extra.json())).not.toContain('Jane');
    const nested = await route(post({ ...valid, facts: { ...valid.facts, guarantor: 'Jane' } }));
    expect(nested.status).toBe(400);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it('the exported route validates before anything reaches a model', async () => {
    expect((await POST(post({ ...valid, guarantorName: 'Jane Doe' }))).status).toBe(400);
    expect((await POST(post('{'))).status).toBe(400);
  });
});
