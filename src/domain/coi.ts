import { daysBetween } from './dates';
import type { CoiRecord, CoiStatus, ISODate } from './types';

export const COI_EXPIRING_DAYS = 30;

/** Statuses the date can't change: the tool is saying something other than "when it expires". */
const FIXED: ReadonlySet<CoiStatus> = new Set(['non_compliant', 'missing', 'unknown']);

/**
 * The status as of `asOf`. The exported status goes stale as the asOf control moves, so
 * valid / expiring / expired come from the expiry date; the rest pass through unchanged.
 */
export function effectiveCoiStatus(record: CoiRecord, asOf: ISODate): CoiStatus {
  if (FIXED.has(record.status) || record.expiresOn === null) return record.status;
  const days = daysBetween(asOf, record.expiresOn);
  if (days < 0) return 'expired';
  if (days <= COI_EXPIRING_DAYS) return 'expiring';
  return 'valid';
}

/** Insurance counts against a lease when the certificate is bad or absent. */
export function isCoiProblem(status: CoiStatus): boolean {
  return status === 'expired' || status === 'non_compliant' || status === 'missing';
}
