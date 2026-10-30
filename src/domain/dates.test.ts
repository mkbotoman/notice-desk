import { describe, expect, it } from 'vitest';
import { addDaysISO, daysBetween, isWeekend } from './dates';

describe('dates', () => {
  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDaysISO('2026-10-25', 10)).toBe('2026-11-04');
    expect(addDaysISO('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDaysISO('2028-02-25', 5)).toBe('2028-03-01');
    expect(addDaysISO('2026-10-14', -14)).toBe('2026-09-30');
  });

  it('is correct across a daylight-saving change', () => {
    expect(addDaysISO('2026-03-07', 2)).toBe('2026-03-09');
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(addDaysISO('2026-10-31', 2)).toBe('2026-11-02');
  });

  it('counts days between dates, negative when earlier', () => {
    expect(daysBetween('2026-10-13', '2026-10-14')).toBe(1);
    expect(daysBetween('2026-10-14', '2026-10-14')).toBe(0);
    expect(daysBetween('2026-10-14', '2026-10-13')).toBe(-1);
  });

  it('knows weekends', () => {
    expect(isWeekend('2026-10-03')).toBe(true);
    expect(isWeekend('2026-10-04')).toBe(true);
    expect(isWeekend('2026-10-05')).toBe(false);
  });
});
