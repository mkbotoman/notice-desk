import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { aiModelId, AI_MAX_BODY_BYTES, DEFAULT_AI_MODEL } from './config';
import { createGenerator } from './gateway';
import { clientKey, createLimiter } from './limit';
import { createAiRoute } from './route';

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

describe('aiModelId', () => {
  it('uses the default gateway model unless overridden', () => {
    expect(aiModelId({})).toBe(DEFAULT_AI_MODEL);
    expect(aiModelId({ AI_GATEWAY_MODEL: '  anthropic/claude-sonnet-5.5 ' })).toBe(
      'anthropic/claude-sonnet-5.5',
    );
    expect(aiModelId({ AI_GATEWAY_MODEL: '   ' })).toBe(DEFAULT_AI_MODEL);
  });
});

describe('createGenerator', () => {
  it('returns trimmed text from the model', async () => {
    const result = await createGenerator({ model: replying('  Hello there.  ') })({
      system: 's',
      prompt: 'p',
    });
    expect(result).toEqual({ ok: true, text: 'Hello there.', model: 'custom' });
  });

  it('reports a model error as unavailable, without throwing or logging the prompt', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error('no credentials');
      },
    });
    const result = await createGenerator({ model: broken })({
      system: 's',
      prompt: 'SECRET PROMPT',
    });
    expect(result).toEqual({ ok: false, reason: 'unavailable' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRET PROMPT');
    warn.mockRestore();
  });

  it('treats empty output as unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await createGenerator({ model: replying('   ') })({ system: 's', prompt: 'p' })).toEqual(
      {
        ok: false,
        reason: 'unavailable',
      },
    );
  });

  it('gives up after the timeout', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const slow = new MockLanguageModelV4({
      doGenerate: (options) =>
        new Promise((_, reject) => {
          options.abortSignal?.addEventListener('abort', () => reject(options.abortSignal?.reason));
        }),
    });
    const result = await createGenerator({ model: slow, timeoutMs: 30 })({
      system: 's',
      prompt: 'p',
    });
    expect(result).toEqual({ ok: false, reason: 'timeout' });
  });
});

describe('createLimiter', () => {
  it('allows up to the maximum per window, per key, then recovers', () => {
    let t = 0;
    const limiter = createLimiter({ max: 2, windowMs: 1000, now: () => t });
    expect([limiter.allow('a'), limiter.allow('a'), limiter.allow('a')]).toEqual([
      true,
      true,
      false,
    ]);
    expect(limiter.allow('b')).toBe(true);
    t = 1500;
    expect(limiter.allow('a')).toBe(true);
  });

  it('reads the caller from x-forwarded-for, or shares one bucket', () => {
    const headers = (value?: string) =>
      new Request('http://x', { headers: value ? { 'x-forwarded-for': value } : {} });
    expect(clientKey(headers('1.2.3.4, 5.6.7.8'))).toBe('1.2.3.4');
    expect(clientKey(headers())).toBe('local');
  });
});

describe('createAiRoute', () => {
  const schema = z.strictObject({ name: z.string().max(20) });
  const post = (body: string) => new Request('http://x/api/ai/test', { method: 'POST', body });
  const route = (handle = async (d: { name: string }) => ({ hello: d.name })) =>
    createAiRoute({ schema, handle, limiter: createLimiter({ max: 100, windowMs: 1000 }) });

  it('runs the handler on valid input', async () => {
    const res = await route()(post('{"name":"Ada"}'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: 'Ada' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects anything off the allowlist, malformed JSON and oversized bodies, without echoing input', async () => {
    const extra = await route()(post('{"name":"Ada","guarantor":"Jane Doe"}'));
    expect(extra.status).toBe(400);
    expect(JSON.stringify(await extra.json())).not.toContain('Jane');
    expect((await route()(post('not json'))).status).toBe(400);
    expect((await route()(post('{"name":"x"}'.padEnd(AI_MAX_BODY_BYTES + 1, ' ')))).status).toBe(
      413,
    );
  });

  it('rate-limits, and turns a handler failure into a generic 500', async () => {
    const tight = createAiRoute({
      schema,
      handle: async () => ({}),
      limiter: createLimiter({ max: 1, windowMs: 1000 }),
    });
    expect((await tight(post('{"name":"a"}'))).status).toBe(200);
    expect((await tight(post('{"name":"a"}'))).status).toBe(429);

    const failing = route(async () => {
      throw new Error('provider said something private');
    });
    const res = await failing(post('{"name":"a"}'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('private');
  });

  it('uses the shared limiter when none is given', async () => {
    const res = await createAiRoute({ schema, handle: async () => ({ ok: true }) })(
      post('{"name":"a"}'),
    );
    expect(res.status).toBe(200);
  });
});
