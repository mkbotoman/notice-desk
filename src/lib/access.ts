// Shared-password gate for the deployed site. Not user auth: the password comes from the
// ACCESS_PASSWORD env var, and the cookie holds an HMAC of it, never the password itself.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const ACCESS_COOKIE = 'nd_access';
export const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
export const GATE_PATH = '/gate';
export const GATE_API_PATH = '/api/gate';

/** Changing the password changes every token, which signs everyone out. */
export function accessToken(password: string): string {
  return createHmac('sha256', password).update('notice-desk-access-v1').digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  // Hash first so the two buffers are always the same length.
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function passwordMatches(input: string, expected: string): boolean {
  return safeEqual(input, expected);
}

export function isValidToken(token: string | undefined, password: string): boolean {
  return token !== undefined && safeEqual(token, accessToken(password));
}

/** Same-site paths only, so the gate can't be used as an open redirect. */
export function safeNextPath(next: string | null | undefined): string {
  // Control characters are stripped by URL parsers, so "/\t/evil.com" would become "//evil.com".
  if (
    !next ||
    !next.startsWith('/') ||
    next.startsWith('//') ||
    /[\u0000-\u001f\u007f\\]/.test(next)
  ) {
    return '/';
  }
  if (next === GATE_PATH || next === GATE_API_PATH || next.startsWith(`${GATE_PATH}?`)) return '/';
  return next;
}

export type AccessDecision = 'allow' | 'to_gate' | 'to_next' | 'unconfigured';

export function decideAccess(input: {
  pathname: string;
  cookie: string | undefined;
  password: string | undefined;
  isProduction: boolean;
}): AccessDecision {
  const { pathname, cookie, password, isProduction } = input;
  if (!password) return isProduction ? 'unconfigured' : 'allow';
  if (pathname === GATE_API_PATH) return 'allow';
  const signedIn = isValidToken(cookie, password);
  if (pathname === GATE_PATH) return signedIn ? 'to_next' : 'allow';
  return signedIn ? 'allow' : 'to_gate';
}
