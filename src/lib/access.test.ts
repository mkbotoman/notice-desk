import { describe, expect, it } from 'vitest';
import { accessToken, decideAccess, isValidToken, passwordMatches, safeNextPath } from './access';

describe('accessToken', () => {
  it('is deterministic, differs by password, and does not contain the password', () => {
    expect(accessToken('secret-one')).toBe(accessToken('secret-one'));
    expect(accessToken('secret-one')).not.toBe(accessToken('secret-two'));
    expect(accessToken('secret-one')).not.toContain('secret-one');
  });
});

describe('passwordMatches', () => {
  it('accepts only the exact password, including inputs of different length', () => {
    expect(passwordMatches('secret-one', 'secret-one')).toBe(true);
    expect(passwordMatches('secret-two', 'secret-one')).toBe(false);
    expect(passwordMatches('', 'secret-one')).toBe(false);
    expect(passwordMatches('secret-one-and-more', 'secret-one')).toBe(false);
  });
});

describe('isValidToken', () => {
  it('accepts the token for the current password only', () => {
    const token = accessToken('secret-one');
    expect(isValidToken(token, 'secret-one')).toBe(true);
    expect(isValidToken(token, 'secret-two')).toBe(false);
  });

  it('rejects missing, empty and garbage tokens', () => {
    expect(isValidToken(undefined, 'secret-one')).toBe(false);
    expect(isValidToken('', 'secret-one')).toBe(false);
    expect(isValidToken('not-a-token', 'secret-one')).toBe(false);
  });
});

describe('safeNextPath', () => {
  it('keeps same-site paths with their query', () => {
    expect(safeNextPath('/cases/N-001?as=lena')).toBe('/cases/N-001?as=lena');
  });

  it('falls back to home for missing, external and gate paths', () => {
    expect(safeNextPath(undefined)).toBe('/');
    expect(safeNextPath('')).toBe('/');
    expect(safeNextPath('https://evil.example')).toBe('/');
    expect(safeNextPath('//evil.example')).toBe('/');
    expect(safeNextPath('/\\evil.example')).toBe('/');
    expect(safeNextPath('/\t/evil.example')).toBe('/');
    expect(safeNextPath('/\n/evil.example')).toBe('/');
    expect(safeNextPath('/\u007f/x')).toBe('/');
    expect(safeNextPath('/gate')).toBe('/');
    expect(safeNextPath('/api/gate')).toBe('/');
  });
});

describe('decideAccess', () => {
  const password = 'secret-one';
  const good = accessToken(password);
  const base = { password, isProduction: true };

  it('sends visitors without a valid cookie to the gate', () => {
    expect(decideAccess({ ...base, pathname: '/cases', cookie: undefined })).toBe('to_gate');
    expect(decideAccess({ ...base, pathname: '/cases', cookie: 'bad' })).toBe('to_gate');
    expect(decideAccess({ ...base, pathname: '/api/ai/draft', cookie: undefined })).toBe('to_gate');
  });

  it('lets signed-in visitors through, and bounces them off the gate page', () => {
    expect(decideAccess({ ...base, pathname: '/cases', cookie: good })).toBe('allow');
    expect(decideAccess({ ...base, pathname: '/gate', cookie: good })).toBe('to_next');
  });

  it('always allows the gate page and its form handler for signed-out visitors', () => {
    expect(decideAccess({ ...base, pathname: '/gate', cookie: undefined })).toBe('allow');
    expect(decideAccess({ ...base, pathname: '/api/gate', cookie: undefined })).toBe('allow');
  });

  it('fails closed in production with no password, and is open in development', () => {
    const unset = { pathname: '/cases', cookie: undefined, password: undefined };
    expect(decideAccess({ ...unset, isProduction: true })).toBe('unconfigured');
    expect(decideAccess({ ...unset, isProduction: false })).toBe('allow');
  });

  it('treats an empty password as unset', () => {
    expect(
      decideAccess({ pathname: '/', cookie: undefined, password: '', isProduction: true }),
    ).toBe('unconfigured');
  });
});
