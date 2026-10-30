import { describe, expect, it } from 'vitest';
import { coverageText, monthLabel, percent, plural, weekLabel } from './format';

describe('analytics formatting', () => {
  it('words the date coverage of a chart', () => {
    expect(coverageText('2026-02-12', '2026-10-12')).toBe('Feb 12 to Oct 12, 2026');
    expect(coverageText('2025-11-03', '2026-02-01')).toBe('Nov 3, 2025 to Feb 1, 2026');
  });

  it('labels months, with the year only when needed', () => {
    expect(monthLabel('2026-02', false)).toBe('Feb');
    expect(monthLabel('2026-02', true)).toBe('Feb 2026');
  });

  it('labels weeks, percentages and plurals', () => {
    expect(weekLabel('2026-10-05')).toBe('Oct 5');
    expect(percent(4 / 7)).toBe('57%');
    expect(plural(1, 'case')).toBe('1 case');
    expect(plural(2, 'case')).toBe('2 cases');
  });
});
