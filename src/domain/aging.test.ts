import { describe, expect, it } from 'vitest';
import { arFloor, checkAging, isRentNonCompliant, worseAging } from './aging';

const RENT = 100000;
const months = (m: number) => Math.round(RENT * m);

describe('arFloor', () => {
  it.each([
    [0, 'current'],
    [1, 'current'],
    [1.2, 'current'],
    [1.21, '31_60'],
    [2, '31_60'],
    [2.2, '31_60'],
    [2.21, '61_90'],
    [3, '61_90'],
    [3.2, '61_90'],
    [3.21, '90_plus'],
    [6, '90_plus'],
  ])('%s months of rent owed is at least %s', (m, expected) => {
    expect(arFloor(months(m), RENT)).toBe(expected);
  });

  it('is null when it cannot be computed', () => {
    expect(arFloor(null, RENT)).toBeNull();
    expect(arFloor(RENT, null)).toBeNull();
    expect(arFloor(RENT, 0)).toBeNull();
    expect(arFloor(-1, RENT)).toBeNull();
  });
});

describe('checkAging (DQ-AR)', () => {
  it('finds nothing wrong when the recorded bucket is as bad as, or worse than, the floor', () => {
    expect(checkAging('current', 0, RENT)).toEqual({ implied: 'current', finding: null });
    expect(checkAging('31_60', months(1), RENT)).toEqual({ implied: 'current', finding: null });
    expect(checkAging('1_30', months(1), RENT).finding).toBeNull();
    expect(checkAging('61_90', months(2), RENT)).toEqual({ implied: '31_60', finding: null });
    expect(checkAging('90_plus', months(3), RENT)).toEqual({ implied: '61_90', finding: null });
    expect(checkAging('90_plus', months(6), RENT).finding).toBeNull();
  });

  it('flags understated aging as an error', () => {
    expect(checkAging('current', months(2), RENT)).toEqual({
      implied: '31_60',
      finding: { kind: 'understated', severity: 'error' },
    });
    expect(checkAging('31_60', months(6), RENT).finding?.kind).toBe('understated');
  });

  it('flags a non-current bucket on a zero balance as stale', () => {
    expect(checkAging('31_60', 0, RENT)).toEqual({
      implied: 'current',
      finding: { kind: 'stale', severity: 'warning' },
    });
  });

  it('never accuses a lease of overstated aging', () => {
    expect(checkAging('90_plus', months(1.3), RENT).finding).toBeNull();
  });

  it('reports a credit as info and skips the check', () => {
    expect(checkAging('31_60', -5000, RENT)).toEqual({
      implied: null,
      finding: { kind: 'credit', severity: 'info' },
    });
  });

  it('warns when it cannot validate', () => {
    expect(checkAging('current', 1000, 0).finding).toEqual({
      kind: 'cannot_validate',
      severity: 'warning',
    });
    expect(checkAging('current', null, RENT).implied).toBeNull();
  });

  it('computes an implied bucket even when the recorded one is unknown, without a finding', () => {
    expect(checkAging('unknown', months(3), RENT)).toEqual({ implied: '61_90', finding: null });
  });
});

describe('worseAging and isRentNonCompliant', () => {
  it('takes the worse of two, ignoring unknown and null', () => {
    expect(worseAging('current', '31_60')).toBe('31_60');
    expect(worseAging('90_plus', '31_60')).toBe('90_plus');
    expect(worseAging('31_60', null)).toBe('31_60');
    expect(worseAging('unknown', '1_30')).toBe('1_30');
    expect(worseAging(null, null)).toBeNull();
    expect(worseAging('unknown', null)).toBeNull();
  });

  it('treats 31–60 and worse as non-compliant, per the brief', () => {
    expect(isRentNonCompliant('1_30')).toBe(false);
    expect(isRentNonCompliant('31_60')).toBe(true);
    expect(isRentNonCompliant('90_plus')).toBe(true);
    expect(isRentNonCompliant(null)).toBe(false);
    expect(isRentNonCompliant('unknown')).toBe(false);
  });
});
