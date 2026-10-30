import { addDaysISO, daysBetween, isWeekend } from '../dates';
import { FIRST_SUPPORTED_YEAR, holidayOn } from '../holidays';
import type { ISODate } from '../types';

/** Before the holiday calendar begins only weekends are skipped, rather than crashing. */
export function isBusinessDay(date: ISODate): boolean {
  if (isWeekend(date)) return false;
  return Number(date.slice(0, 4)) < FIRST_SUPPORTED_YEAR || holidayOn(date) === undefined;
}

/** Business days after `from` up to and including `to`. Zero when `to` is not after `from`. */
export function businessDaysUntil(from: ISODate, to: ISODate): number {
  let count = 0;
  for (let i = 1, n = daysBetween(from, to); i <= n; i += 1) {
    if (isBusinessDay(addDaysISO(from, i))) count += 1;
  }
  return count;
}
