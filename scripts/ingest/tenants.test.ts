import { describe, expect, it } from 'vitest';
import { buildTenantRegistry } from './tenants';

describe('buildTenantRegistry', () => {
  it('merges exact normalized matches and picks the most common spelling', () => {
    const r = buildTenantRegistry([
      'Brightside Fitness LLC',
      'Brightside Fitness LLC',
      'BrightSide Fitness',
      'Brightside Fitness, LLC',
      'Coastal Coffee Co',
    ]);
    expect(r.tenants.map((t) => t.displayName)).toEqual([
      'Brightside Fitness LLC',
      'Coastal Coffee Co',
    ]);
    expect(r.tenants[0].nameVariants).toEqual(['BrightSide Fitness', 'Brightside Fitness, LLC']);
    expect(r.idFor('BrightSide Fitness')).toBe(r.idFor('Brightside Fitness LLC'));
    expect(r.displayNameOf(r.idFor('Brightside Fitness, LLC'))).toBe('Brightside Fitness LLC');
  });

  it('breaks spelling ties toward the longer name, then alphabetically', () => {
    expect(buildTenantRegistry(['Acme', 'Acme LLC']).tenants[0].displayName).toBe('Acme LLC');
    expect(buildTenantRegistry(['Acme LLC', 'Acme, LLC']).tenants[0].displayName).toBe('Acme, LLC');
  });

  it('makes ids from the normalized name, so they do not depend on row order', () => {
    const a = buildTenantRegistry(['Zed Co', 'Alpha Inc']);
    const b = buildTenantRegistry(['Alpha Inc', 'Zed Co']);
    expect(a.tenants).toEqual(b.tenants);
    expect(a.idFor('Alpha Inc')).toBe('T-alpha');
  });

  it('merges names that differ only by punctuation, and keeps a suffix-only name distinct', () => {
    const r = buildTenantRegistry(['A+B Shop', 'A B Shop!', 'LLC', 'Inc']);
    expect(r.tenants).toHaveLength(3);
    expect(r.idFor('A+B Shop')).toBe(r.idFor('A B Shop!'));
    expect(r.idFor('LLC')).toBe('T-llc');
    expect(r.idFor('Inc')).toBe('T-inc');
  });

  it('reports near matches without merging them', () => {
    const r = buildTenantRegistry(['Harbor Fitness', 'Harbour Fitness', 'Totally Different']);
    expect(r.tenants).toHaveLength(3);
    expect(r.nearMatches.map(([a, b]) => [a.displayName, b.displayName])).toEqual([
      ['Harbor Fitness', 'Harbour Fitness'],
    ]);
  });

  it('skips blank names and refuses an unregistered one', () => {
    const r = buildTenantRegistry(['', '   ', 'Real Co']);
    expect(r.tenants).toHaveLength(1);
    expect(() => r.idFor('Someone Else')).toThrow(/not registered/);
  });
});
