import { z } from 'zod';
import { AI_MAX_BODY_BYTES } from './config';
import { clientKey, createLimiter, type Limiter } from './limit';

const defaultLimiter = createLimiter();
/** Every caller together: the password is shared, so a per-client limit alone isn't a spend cap. */
const globalLimiter = createLimiter({ max: 120, windowMs: 60_000 });

const json = (body: Record<string, unknown>, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * The shared shell for an AI route handler (`export const POST = createAiRoute({...})`).
 * Rate-limits, reads a bounded body, validates it STRICTLY against `schema` (anything not on the
 * allowlist is rejected, never forwarded), runs `handle`, and returns its JSON. Error responses
 * are generic: they never echo the input and never carry a stack or a provider message.
 * The password gate (src/proxy.ts) already covers every /api route.
 */
export function createAiRoute<T>(options: {
  schema: z.ZodType<T>;
  handle: (data: T) => Promise<Record<string, unknown>>;
  limiter?: Limiter;
}): (request: Request) => Promise<Response> {
  const limiter = options.limiter ?? defaultLimiter;
  return async (request) => {
    if (!limiter.allow(clientKey(request)) || !globalLimiter.allow('all')) {
      return json({ error: 'rate_limited' }, 429);
    }
    if (Number(request.headers.get('content-length') ?? 0) > AI_MAX_BODY_BYTES) {
      return json({ error: 'too_large' }, 413);
    }

    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > AI_MAX_BODY_BYTES) {
      return json({ error: 'too_large' }, 413);
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'invalid_request' }, 400);
    }
    const parsed = options.schema.safeParse(body);
    if (!parsed.success) return json({ error: 'invalid_request' }, 400);

    try {
      return json(await options.handle(parsed.data), 200);
    } catch {
      return json({ error: 'failed' }, 500);
    }
  };
}
