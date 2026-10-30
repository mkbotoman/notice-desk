import { describe, expect, it } from 'vitest';
import type { Case, CoiRecord, Lease, Persona } from '@/domain/types';
import { UNKNOWN_PROPERTY } from '@/components/case-list/filters';
import {
  NO_WATCH_FILTERS,
  buildWatchlist,
  filterWatchlist,
  hasWatchFilters,
  splitWatchlist,
} from './watchlist-logic';

const ASOF = '2026-10-13';

const lease = (id: string, over: Partial<Lease> = {}): Lease => ({
  id,
  propertyId: 'P1',
  tenantId: `T-${id}`,
  suite: '1',
  sqFt: null,
  status: 'active',
  startDate: null,
  endDate: null,
  monthlyRent: 100000,
  arBalance: 0,
  arAgingRecorded: 'current',
  arAgingImplied: 'current',
  watchlistReasons: [],
  ...over,
});
const goodCoi = (id: string): CoiRecord => ({
  tenantId: `T-${id}`,
  propertyId: 'P1',
  leaseIds: [id],
  status: 'valid',
  expiresOn: '2027-06-30',
});
const coiFor = (...ids: string[]) => new Map(ids.map((id) => [id, goodCoi(id)]));
const openCase = (leaseId: string, stage: Case['stage'] = 'non_compliant') =>
  ({ id: `N-${leaseId}-${stage}`, leaseId, stage }) as Case;

const legal = { kind: 'legal', scopePropertyIds: 'all' } as Persona;
const founder = { kind: 'founder', scopePropertyIds: 'all' } as Persona;
const lena = { kind: 'asset_manager', scopePropertyIds: ['P1'] } as Persona;
const maya = { kind: 'property_manager', scopePropertyIds: ['P1'] } as Persona;

describe('buildWatchlist', () => {
  const clean = lease('L-clean');
  const late = lease('L-late', { arAgingRecorded: '31_60', arAgingImplied: '31_60' });
  const stale = lease('L-stale', { arAgingRecorded: 'current', arAgingImplied: '61_90' });
  const uninsured = lease('L-uninsured');
  const listed = lease('L-listed', { watchlistReasons: ['Sublease'] });
  const worst = lease('L-worst', {
    arAgingRecorded: '90_plus',
    arAgingImplied: '90_plus',
    watchlistReasons: ['Going dark'],
  });
  const noImplied = lease('L-noimplied', { arAgingRecorded: '61_90', arAgingImplied: null });
  const all = [clean, late, stale, uninsured, listed, worst, noImplied];
  const coi = coiFor('L-clean', 'L-late', 'L-stale', 'L-listed', 'L-worst', 'L-noimplied');

  it('keeps leases with a signal and no open case, most severe first', () => {
    const rows = buildWatchlist(all, [], coi, legal, ASOF);
    expect(rows.map((r) => r.lease.id)).toEqual([
      'L-worst',
      'L-noimplied',
      'L-stale',
      'L-late',
      'L-uninsured',
      'L-listed',
    ]);
    expect(rows.find((r) => r.lease.id === 'L-uninsured')!.signals[0].label).toBe(
      'No insurance on file',
    );
  });

  it('flags recorded and implied aging that disagree', () => {
    const rows = buildWatchlist(all, [], coi, legal, ASOF);
    expect(rows.find((r) => r.lease.id === 'L-stale')!.agingGap).toEqual({
      recorded: 'current',
      implied: '61_90',
    });
    expect(rows.find((r) => r.lease.id === 'L-late')!.agingGap).toBeNull();
    expect(rows.find((r) => r.lease.id === 'L-noimplied')!.agingGap).toBeNull();
  });

  it('drops leases that already have an open case but not those with only a closed one', () => {
    const cases = [openCase('L-late'), openCase('L-stale', 'closed'), openCase('L-worst', 'cured')];
    const ids = buildWatchlist(all, cases, coi, legal, ASOF).map((r) => r.lease.id);
    expect(ids).not.toContain('L-late');
    expect(ids).toContain('L-stale');
    expect(ids).toContain('L-worst');
  });

  it('breaks ties by aging, then id', () => {
    const a = lease('L-b', { arAgingRecorded: '31_60', arAgingImplied: '31_60' });
    const b = lease('L-a', { arAgingRecorded: '61_90', arAgingImplied: '61_90' });
    const c = lease('L-c', { arAgingRecorded: '31_60', arAgingImplied: '31_60' });
    const rows = buildWatchlist([a, b, c], [], coiFor('L-a', 'L-b', 'L-c'), legal, ASOF);
    expect(rows.map((r) => r.lease.id)).toEqual(['L-a', 'L-b', 'L-c']);
  });

  it('ranks a lease with no usable aging last among equals', () => {
    const none = lease('L-none', { arAgingRecorded: 'unknown', arAgingImplied: null });
    const rows = buildWatchlist([none, listed], [], coiFor('L-none', 'L-listed'), legal, ASOF);
    expect(rows).toHaveLength(1);
    const two = lease('L-two', { watchlistReasons: ['x'], arAgingRecorded: 'unknown' });
    const one = lease('L-one', { watchlistReasons: ['x'], arAgingRecorded: '1_30' });
    expect(
      buildWatchlist([two, one], [], coiFor('L-two', 'L-one'), legal, ASOF).map((r) => r.lease.id),
    ).toEqual(['L-one', 'L-two']);
  });

  it('applies property scope, and shows a lease with no property only to all-scope personas', () => {
    const elsewhere = lease('L-else', { propertyId: 'P2', watchlistReasons: ['x'] });
    const orphan = lease('L-orphan', { propertyId: null, watchlistReasons: ['x'] });
    const set = [listed, elsewhere, orphan];
    const c = coiFor('L-listed', 'L-else', 'L-orphan');
    expect(buildWatchlist(set, [], c, lena, ASOF).map((r) => r.lease.id)).toEqual(['L-listed']);
    expect(buildWatchlist(set, [], c, founder, ASOF)).toHaveLength(3);
  });

  it('is empty for a persona who may not see analytics', () => {
    expect(buildWatchlist(all, [], coi, maya, ASOF)).toEqual([]);
  });
});

describe('filterWatchlist and splitWatchlist', () => {
  const rent = lease('L-rent', { arAgingRecorded: '61_90', arAgingImplied: '61_90' });
  const reason = lease('L-reason', { watchlistReasons: ['Sublease'] });
  const orphan = lease('L-orphan', { propertyId: null, watchlistReasons: ['x'] });
  const other = lease('L-other', { propertyId: 'P2', watchlistReasons: ['x'] });
  const rows = buildWatchlist(
    [rent, reason, orphan, other],
    [],
    coiFor('L-rent', 'L-reason', 'L-orphan', 'L-other'),
    legal,
    ASOF,
  );

  it('filters by signal kind and by property, including unknown', () => {
    expect(hasWatchFilters(NO_WATCH_FILTERS)).toBe(false);
    expect(hasWatchFilters({ signal: 'rent', property: null })).toBe(true);
    expect(hasWatchFilters({ signal: null, property: 'P1' })).toBe(true);
    expect(filterWatchlist(rows, NO_WATCH_FILTERS)).toHaveLength(4);
    expect(
      filterWatchlist(rows, { signal: 'rent', property: null }).map((r) => r.lease.id),
    ).toEqual(['L-rent']);
    expect(filterWatchlist(rows, { signal: null, property: 'P2' }).map((r) => r.lease.id)).toEqual([
      'L-other',
    ]);
    expect(
      filterWatchlist(rows, { signal: null, property: UNKNOWN_PROPERTY }).map((r) => r.lease.id),
    ).toEqual(['L-orphan']);
    expect(filterWatchlist(rows, { signal: 'insurance', property: 'P1' })).toEqual([]);
  });

  it('splits breaches from listed-only risks', () => {
    const { breaches, listed } = splitWatchlist(rows);
    expect(breaches.map((r) => r.lease.id)).toEqual(['L-rent']);
    expect(listed).toHaveLength(3);
  });
});
