import { describe, expect, it } from 'vitest';
import { describeDays, formatCents, longDate, shortDate, weekdayDate } from './format';

describe('formatCents', () => {
  it.each([
    [2190000, '$21,900.00'],
    [2190050, '$21,900.50'],
    [5, '$0.05'],
    [0, '$0.00'],
    [-25000, '-$250.00'],
    [1234567 * 100 + 89, '$1,234,567.89'],
    [null, '—'],
  ])('%s -> %s', (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });
});

describe('dates and days', () => {
  it('formats dates without time-zone drift', () => {
    expect(shortDate('2026-10-13')).toBe('Oct 13');
    expect(weekdayDate('2026-10-13')).toBe('Tue, Oct 13');
    expect(longDate('2026-10-13')).toBe('Tue, Oct 13, 2026');
  });

  it('describes days in plain words', () => {
    expect(describeDays(-20)).toBe('20 days overdue');
    expect(describeDays(-1)).toBe('1 day overdue');
    expect(describeDays(0)).toBe('due today');
    expect(describeDays(1)).toBe('in 1 day');
    expect(describeDays(5)).toBe('in 5 days');
  });
});
