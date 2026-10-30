import { describe, expect, it } from 'vitest';
import type { CoiRecord, Lease } from './types';
import { leaseSignals, looksNonCompliant } from './watchlist';

const lease = (over: Partial<Lease> = {}): Lease => ({
  id: 'L-1',
  propertyId: 'P-1',
  tenantId: 'T-1',
  suite: '1',
  sqFt: 1000,
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
const coi = (over: Partial<CoiRecord> = {}): CoiRecord => ({
  tenantId: 'T-1',
  propertyId: 'P-1',
  leaseIds: ['L-1'],
  status: 'valid',
  expiresOn: '2027-06-01',
  ...over,
});
const asOf = '2026-10-13';

describe('leaseSignals', () => {
  it('is empty for a healthy lease', () => {
    expect(leaseSignals(lease(), coi(), asOf)).toEqual([]);
  });

  it('flags rent 31–60 days late or worse, using the recorded aging', () => {
    expect(leaseSignals(lease({ arAgingRecorded: '31_60' }), coi(), asOf)).toEqual([
      { kind: 'rent', label: 'Rent 31–60 days', agingDisagrees: true },
    ]);
    expect(leaseSignals(lease({ arAgingRecorded: '1_30' }), coi(), asOf)).toEqual([]);
  });

  it('uses the worse of recorded and implied, so a stale bucket cannot hide a delinquent tenant', () => {
    const s = leaseSignals(
      lease({ arAgingRecorded: 'current', arAgingImplied: '61_90' }),
      coi(),
      asOf,
    );
    expect(s).toEqual([{ kind: 'rent', label: 'Rent 61–90 days', agingDisagrees: true }]);
  });

  it('notes when recorded and implied agree, and when implied is unavailable or recorded unknown', () => {
    expect(
      leaseSignals(
        lease({ arAgingRecorded: '90_plus', arAgingImplied: '90_plus' }),
        coi(),
        asOf,
      )[0],
    ).toMatchObject({ agingDisagrees: false });
    expect(
      leaseSignals(lease({ arAgingRecorded: '90_plus', arAgingImplied: null }), coi(), asOf)[0],
    ).toMatchObject({ agingDisagrees: false });
    expect(
      leaseSignals(lease({ arAgingRecorded: 'unknown', arAgingImplied: '61_90' }), coi(), asOf)[0],
    ).toMatchObject({ agingDisagrees: false });
  });

  it('flags a certificate that is expired as of the date, non-compliant, or absent', () => {
    expect(leaseSignals(lease(), coi({ expiresOn: '2026-10-01' }), asOf)[0]).toEqual({
      kind: 'insurance',
      label: 'Insurance expired',
    });
    expect(leaseSignals(lease(), coi({ status: 'non_compliant' }), asOf)[0]).toEqual({
      kind: 'insurance',
      label: 'Insurance non-compliant',
    });
    expect(leaseSignals(lease(), undefined, asOf)[0]).toEqual({
      kind: 'insurance',
      label: 'No insurance on file',
    });
    expect(leaseSignals(lease(), coi({ status: 'missing', expiresOn: null }), asOf)[0].label).toBe(
      'No insurance on file',
    );
  });

  it('does not flag a certificate that is merely expiring', () => {
    expect(leaseSignals(lease(), coi({ expiresOn: '2026-10-30' }), asOf)).toEqual([]);
  });

  it('lists the lease’s own watchlist reasons as risk notes', () => {
    const s = leaseSignals(lease({ watchlistReasons: ['Going Dark', 'Low Sales'] }), coi(), asOf);
    expect(s).toEqual([
      { kind: 'listed', label: 'Going Dark' },
      { kind: 'listed', label: 'Low Sales' },
    ]);
  });
});

describe('looksNonCompliant', () => {
  it('is true for rent or insurance signals, and false for listed reasons alone', () => {
    expect(looksNonCompliant(leaseSignals(lease({ arAgingRecorded: '31_60' }), coi(), asOf))).toBe(
      true,
    );
    expect(looksNonCompliant(leaseSignals(lease(), undefined, asOf))).toBe(true);
    expect(
      looksNonCompliant(leaseSignals(lease({ watchlistReasons: ['Going Dark'] }), coi(), asOf)),
    ).toBe(false);
    expect(looksNonCompliant([])).toBe(false);
  });
});
