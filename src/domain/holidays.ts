import { format } from 'date-fns';
import type { ISODate } from './types';

export interface Holiday {
  date: ISODate;
  name: string;
}

/** Juneteenth became a federal holiday in 2021; earlier years would silently miscount. */
export const FIRST_SUPPORTED_YEAR = 2021;

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month - 1, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month - 1, 1 + offset + (n - 1) * 7);
}

function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month - 1, last.getDate() - offset);
}

/** A fixed-date holiday on a Saturday is observed Friday; on a Sunday, Monday. */
function observed(year: number, month: number, day: number): Date {
  const date = new Date(year, month - 1, day);
  if (date.getDay() === 6) return new Date(year, month - 1, day - 1);
  if (date.getDay() === 0) return new Date(year, month - 1, day + 1);
  return date;
}

const MON = 1;
const THU = 4;

function holidaysFor(year: number): Holiday[] {
  return [
    { date: iso(observed(year, 1, 1)), name: "New Year's Day" },
    { date: iso(nthWeekday(year, 1, MON, 3)), name: 'Martin Luther King Jr. Day' },
    { date: iso(nthWeekday(year, 2, MON, 3)), name: "Presidents' Day" },
    { date: iso(lastWeekday(year, 5, MON)), name: 'Memorial Day' },
    { date: iso(observed(year, 6, 19)), name: 'Juneteenth' },
    { date: iso(observed(year, 7, 4)), name: 'Independence Day' },
    { date: iso(nthWeekday(year, 9, MON, 1)), name: 'Labor Day' },
    { date: iso(nthWeekday(year, 10, MON, 2)), name: 'Columbus Day' },
    { date: iso(observed(year, 11, 11)), name: 'Veterans Day' },
    { date: iso(nthWeekday(year, 11, THU, 4)), name: 'Thanksgiving Day' },
    { date: iso(observed(year, 12, 25)), name: 'Christmas Day' },
  ];
}

const cache = new Map<number, Map<ISODate, string>>();

/** Federal holidays observed in `year`, including a neighbouring year's holiday that spills in. */
function holidayMap(year: number): Map<ISODate, string> {
  const cached = cache.get(year);
  if (cached) return cached;
  const map = new Map<ISODate, string>();
  for (const y of [year - 1, year, year + 1]) {
    for (const h of holidaysFor(y)) {
      if (h.date.startsWith(`${year}-`)) map.set(h.date, h.name);
    }
  }
  cache.set(year, map);
  return map;
}

export function holidayOn(date: ISODate): Holiday | undefined {
  const year = Number(date.slice(0, 4));
  if (year < FIRST_SUPPORTED_YEAR) {
    throw new RangeError(`Holiday calendar starts in ${FIRST_SUPPORTED_YEAR}; got ${date}`);
  }
  const name = holidayMap(year).get(date);
  return name === undefined ? undefined : { date, name };
}

export function holidaysInYear(year: number): Holiday[] {
  holidayOn(`${year}-01-01`);
  return [...holidayMap(year)]
    .map(([date, name]) => ({ date, name }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
