export interface Limiter {
  /** True if this key may make another request now. */
  allow(key: string): boolean;
}

/**
 * A sliding window per key, held in memory. It bounds spend from one client on one server
 * instance; it is a seatbelt, not a quota, and each serverless instance counts separately.
 */
export function createLimiter(
  options: { max: number; windowMs: number; now?: () => number } = { max: 20, windowMs: 60_000 },
): Limiter {
  const now = options.now ?? Date.now;
  const hits = new Map<string, number[]>();
  return {
    allow(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((h) => t - h < options.windowMs);
      if (recent.length >= options.max) {
        hits.set(key, recent);
        return false;
      }
      hits.set(key, [...recent, t]);
      return true;
    },
  };
}

/** The caller's address as the platform reports it, or one shared bucket when there is none. */
export function clientKey(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}
