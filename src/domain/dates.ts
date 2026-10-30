import { addDays, differenceInCalendarDays, format, getDay, parseISO } from 'date-fns';
import type { ISODate } from './types';

// All dates are calendar dates ('YYYY-MM-DD'), parsed as local midnight so day arithmetic never
// crosses a DST boundary into the wrong day.

export function addDaysISO(iso: ISODate, n: number): ISODate {
  return format(addDays(parseISO(iso), n), 'yyyy-MM-dd');
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: ISODate, to: ISODate): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}

export function isWeekend(iso: ISODate): boolean {
  const day = getDay(parseISO(iso));
  return day === 0 || day === 6;
}
