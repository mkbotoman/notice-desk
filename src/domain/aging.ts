import type { ArAging, Cents } from './types';

/** Tolerance for partial payments and a freshly billed month, as multiples of monthly rent. */
export const AR_FLOOR_THRESHOLDS = {
  oneChargeMax: 1.2,
  twoChargesMax: 2.2,
  threeChargesMax: 3.2,
} as const;

const RANK: Record<ArAging, number> = {
  current: 0,
  '1_30': 1,
  '31_60': 2,
  '61_90': 3,
  '90_plus': 4,
  unknown: -1,
};

export const AR_AGING_LABELS: Record<ArAging, string> = {
  current: 'Current',
  '1_30': '1–30 days',
  '31_60': '31–60 days',
  '61_90': '61–90 days',
  '90_plus': '90+ days',
  unknown: 'Unknown',
};

/** Rent more than 30 days late: the brief's trigger for Non-Compliant. */
export function isRentNonCompliant(aging: ArAging | null): boolean {
  return aging !== null && RANK[aging] >= RANK['31_60'];
}

/** The worse of two agings, ignoring unknown and null. Null when neither is usable. */
export function worseAging(a: ArAging | null, b: ArAging | null): ArAging | null {
  const usable = [a, b].filter((x): x is ArAging => x !== null && x !== 'unknown');
  if (usable.length === 0) return null;
  return usable.reduce((worst, x) => (RANK[x] > RANK[worst] ? x : worst));
}

/**
 * The best aging a balance allows. With n charges open, the oldest is at least (n - 1) months
 * old, because the newest may have just been billed. Payments only lower the balance, so this
 * can prove aging is understated but never that it is overstated.
 * Null when it can't be computed (no rent) or there is a credit.
 */
export function arFloor(balance: Cents | null, rent: Cents | null): ArAging | null {
  if (balance === null || rent === null || rent <= 0 || balance < 0) return null;
  const months = balance / rent;
  const { oneChargeMax, twoChargesMax, threeChargesMax } = AR_FLOOR_THRESHOLDS;
  if (months <= oneChargeMax) return 'current';
  if (months <= twoChargesMax) return '31_60';
  if (months <= threeChargesMax) return '61_90';
  return '90_plus';
}

export type AgingFinding =
  | { kind: 'understated'; severity: 'error' }
  | { kind: 'stale'; severity: 'warning' }
  | { kind: 'cannot_validate'; severity: 'warning' }
  | { kind: 'credit'; severity: 'info' };

export interface AgingCheck {
  implied: ArAging | null;
  finding: AgingFinding | null;
}

/** Rule DQ-AR. */
export function checkAging(
  recorded: ArAging,
  balance: Cents | null,
  rent: Cents | null,
): AgingCheck {
  if (balance !== null && balance < 0) {
    return { implied: null, finding: { kind: 'credit', severity: 'info' } };
  }
  const implied = arFloor(balance, rent);
  if (implied === null) {
    return { implied, finding: { kind: 'cannot_validate', severity: 'warning' } };
  }
  if (balance === 0 && RANK[recorded] > RANK.current) {
    return { implied, finding: { kind: 'stale', severity: 'warning' } };
  }
  if (recorded !== 'unknown' && RANK[implied] > RANK[recorded]) {
    return { implied, finding: { kind: 'understated', severity: 'error' } };
  }
  return { implied, finding: null };
}
