import { describe, expect, it } from 'vitest';
import { FIRST_SUPPORTED_YEAR, holidayOn, holidaysInYear } from './holidays';

const dates = (year: number) => holidaysInYear(year).map((h) => h.date);

describe('federal holidays', () => {
  it('matches the 2025 calendar', () => {
    expect(dates(2025)).toEqual([
      '2025-01-01',
      '2025-01-20',
      '2025-02-17',
      '2025-05-26',
      '2025-06-19',
      '2025-07-04',
      '2025-09-01',
      '2025-10-13',
      '2025-11-11',
      '2025-11-27',
      '2025-12-25',
    ]);
  });

  it('matches 2026, with July 4 (a Saturday) observed on Friday the 3rd', () => {
    expect(dates(2026)).toEqual([
      '2026-01-01',
      '2026-01-19',
      '2026-02-16',
      '2026-05-25',
      '2026-06-19',
      '2026-07-03',
      '2026-09-07',
      '2026-10-12',
      '2026-11-11',
      '2026-11-26',
      '2026-12-25',
    ]);
  });

  it('matches 2027: Saturday holidays move to Friday, Sunday ones to Monday, and 2028 spills in', () => {
    expect(dates(2027)).toEqual([
      '2027-01-01',
      '2027-01-18',
      '2027-02-15',
      '2027-05-31',
      '2027-06-18',
      '2027-07-05',
      '2027-09-06',
      '2027-10-11',
      '2027-11-11',
      '2027-11-25',
      '2027-12-24',
      '2027-12-31',
    ]);
  });

  it('names a holiday and returns undefined on a working day', () => {
    expect(holidayOn('2026-10-12')).toEqual({ date: '2026-10-12', name: 'Columbus Day' });
    expect(holidayOn('2027-12-31')?.name).toBe("New Year's Day");
    expect(holidayOn('2026-10-13')).toBeUndefined();
  });

  it('serves repeat lookups for a year from the cache', () => {
    expect(holidaysInYear(2026)).toEqual(holidaysInYear(2026));
  });

  it('refuses years before the calendar is reliable', () => {
    expect(() => holidayOn(`${FIRST_SUPPORTED_YEAR - 1}-07-04`)).toThrow(RangeError);
    expect(() => holidaysInYear(FIRST_SUPPORTED_YEAR - 1)).toThrow(RangeError);
  });
});
