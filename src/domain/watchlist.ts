import { AR_AGING_LABELS, isRentNonCompliant, worseAging } from './aging';
import { effectiveCoiStatus, isCoiProblem } from './coi';
import type { CoiRecord, ISODate, Lease } from './types';

export type SignalKind = 'rent' | 'insurance' | 'listed';

export interface LeaseSignal {
  kind: SignalKind;
  /** Short, plain-English reason, for a chip or a row. */
  label: string;
  /** Rent only: the recorded and implied agings disagree, so the recorded one may be stale. */
  agingDisagrees?: boolean;
}

/**
 * Why a lease looks troubled. `rent` and `insurance` are the brief's two Non-Compliant triggers
 * (rent 31–60 days late or worse, or an insurance certificate that is expired, non-compliant or
 * absent). `listed` is a reason already on the lease's own watchlist (sublease, going dark, ...):
 * a risk note, not a breach. Rent uses the worse of recorded and implied aging, so a stale
 * recorded bucket can't hide a delinquent tenant.
 */
export function leaseSignals(
  lease: Lease,
  coi: CoiRecord | undefined,
  asOf: ISODate,
): LeaseSignal[] {
  const signals: LeaseSignal[] = [];

  const worst = worseAging(lease.arAgingRecorded, lease.arAgingImplied);
  if (isRentNonCompliant(worst) && worst !== null) {
    const disagrees =
      lease.arAgingImplied !== null &&
      lease.arAgingRecorded !== 'unknown' &&
      lease.arAgingRecorded !== lease.arAgingImplied;
    signals.push({
      kind: 'rent',
      label: `Rent ${AR_AGING_LABELS[worst]}`,
      agingDisagrees: disagrees,
    });
  }

  const status = coi ? effectiveCoiStatus(coi, asOf) : 'missing';
  if (isCoiProblem(status)) {
    const labels = {
      expired: 'Insurance expired',
      non_compliant: 'Insurance non-compliant',
      missing: 'No insurance on file',
    } as const;
    signals.push({ kind: 'insurance', label: labels[status as keyof typeof labels] });
  }

  for (const reason of lease.watchlistReasons) signals.push({ kind: 'listed', label: reason });
  return signals;
}

/** True when the brief's Non-Compliant triggers fire (rent or insurance), whatever else is listed. */
export const looksNonCompliant = (signals: readonly LeaseSignal[]): boolean =>
  signals.some((s) => s.kind === 'rent' || s.kind === 'insurance');
