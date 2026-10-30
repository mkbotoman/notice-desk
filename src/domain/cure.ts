import type { CurePeriod } from './types';

const NO_CURE = /^(no cure( date| period)?|none|n\/a|na|not applicable|no deadline|-|—)$/;
/** A cure period longer than a year is a typo, not a deadline. */
export const MAX_CURE_DAYS = 365;

const AMOUNT = /^(\d+)\s*(.*)$/;
const BUSINESS = /^(business|bus\.?|biz|bd|b\.?d\.?)(\s+days?)?$/;
const CALENDAR = /^(calendar|cal\.?|cd|consecutive)(\s+days?)?$/;
const PLAIN_DAYS = /^(days?|d)$/;

/**
 * Parses the notice sheet's free-text cure period.
 *
 * - Explicit "no cure" wording gives `none`.
 * - Blank, or anything unreadable, gives `unknown`: ingest decides whether a blank is acceptable
 *   (a notice not yet sent) or an error.
 * - A day count with no unit ("10 days", or a bare "10") is calendar days. The sheet also uses
 *   "10 business days" explicitly, so a missing unit reads as the plain-English default.
 */
export function parseCurePeriod(raw: string | null | undefined): CurePeriod {
  const text = (raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (text === '') return { kind: 'unknown' };
  if (NO_CURE.test(text)) return { kind: 'none' };

  const match = AMOUNT.exec(text);
  if (!match) return { kind: 'unknown' };
  const n = Number(match[1]);
  const unit = match[2];
  if (n < 1 || n > MAX_CURE_DAYS) return { kind: 'unknown' };

  if (unit === '' || PLAIN_DAYS.test(unit) || CALENDAR.test(unit)) {
    return { kind: 'days', n, unit: 'calendar' };
  }
  if (BUSINESS.test(unit)) return { kind: 'days', n, unit: 'business' };
  return { kind: 'unknown' };
}

/** Plain-English form of a cure period, as shown beside the calculated deadline. */
export function describeCurePeriod(cure: CurePeriod): string {
  if (cure.kind === 'none') return 'No cure date';
  if (cure.kind === 'unknown') return 'Cure period not readable';
  const noun = cure.unit === 'business' ? 'business day' : 'calendar day';
  return `${cure.n} ${noun}${cure.n === 1 ? '' : 's'}`;
}
