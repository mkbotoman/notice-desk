import { describe, expect, it } from 'vitest';
import { makeCase } from '@/test/factories';
import type { Lease } from '../types';
import { repeatTenants, topTenantsByAr, topTenantsByCases } from './tenants';

const lease = (id: string, tenantId: string, arBalance: number | null): Lease => ({
  id,
  propertyId: 'P-1',
  tenantId,
  suite: null,
  sqFt: null,
  status: 'active',
  startDate: null,
  endDate: null,
  monthlyRent: null,
  arBalance,
  arAgingRecorded: 'current',
  arAgingImplied: null,
  watchlistReasons: [],
});

const nameOf = (id: string) => id.toUpperCase();
const kase = (id: string, tenantId: string, over = {}) =>
  makeCase({ id, tenantId, leaseId: `L-${id}`, ...over });

describe('topTenantsByCases', () => {
  const cases = [
    kase('1', 'b'),
    kase('2', 'b', { stage: 'closed' }),
    kase('3', 'a'),
    kase('4', 'c'),
    kase('5', 'c'),
    kase('6', 'd'),
  ];

  it('ranks by case count including closed, ties by name, and limits', () => {
    const { rows, total } = topTenantsByCases(cases, nameOf, 3);
    expect(total).toBe(4);
    expect(rows).toEqual([
      { tenantId: 'b', name: 'B', cases: 2, open: 1 },
      { tenantId: 'c', name: 'C', cases: 2, open: 2 },
      { tenantId: 'a', name: 'A', cases: 1, open: 1 },
    ]);
  });

  it('is empty without cases', () => {
    expect(topTenantsByCases([], nameOf, 3)).toEqual({ rows: [], total: 0 });
  });
});

describe('topTenantsByAr', () => {
  it('sums balances per tenant, drops zero, null and credit, and ranks', () => {
    const leases = [
      lease('1', 'a', 100),
      lease('2', 'a', 50),
      lease('3', 'b', 150),
      lease('4', 'c', null),
      lease('5', 'd', -20),
      lease('6', 'e', 10),
    ];
    const { rows, total } = topTenantsByAr(leases, nameOf, 2);
    expect(total).toBe(3);
    expect(rows).toEqual([
      { tenantId: 'a', name: 'A', ar: 150, leases: 2 },
      { tenantId: 'b', name: 'B', ar: 150, leases: 1 },
    ]);
  });
});

describe('repeatTenants', () => {
  it('lists tenants with two or more cases with leases affected and live AR', () => {
    const cases = [
      kase('1', 'a'),
      kase('2', 'a', { stage: 'cured' }),
      kase('3', 'b'),
      kase('4', 'b'),
      kase('5', 'b'),
      kase('6', 'c'),
      kase('7', 'd'),
      kase('8', 'd'),
      makeCase({ id: '9', tenantId: 'e', leaseId: null }),
      makeCase({ id: '10', tenantId: 'e', leaseId: null }),
      makeCase({ id: '11', tenantId: 'a', leaseId: 'L-1' }),
    ];
    const leases = [lease('L-1', 'a', 400), lease('L-2', 'a', 100), lease('L-7', 'd', 500)];
    const { rows, total } = repeatTenants(cases, leases, nameOf, 4);
    expect(total).toBe(4);
    expect(rows).toEqual([
      { tenantId: 'a', name: 'A', cases: 3, open: 2, leasesAffected: 2, ar: 500 },
      { tenantId: 'b', name: 'B', cases: 3, open: 3, leasesAffected: 3, ar: 0 },
      { tenantId: 'd', name: 'D', cases: 2, open: 2, leasesAffected: 2, ar: 500 },
      { tenantId: 'e', name: 'E', cases: 2, open: 2, leasesAffected: 0, ar: 0 },
    ]);
  });

  it('applies the limit and breaks full ties by name', () => {
    const cases = [kase('1', 'y'), kase('2', 'y'), kase('3', 'x'), kase('4', 'x')];
    const { rows, total } = repeatTenants(cases, [], nameOf, 1);
    expect(total).toBe(2);
    expect(rows.map((r) => r.name)).toEqual(['X']);
  });
});
