import { describe, expect, it } from 'vitest';
import { describeCurePeriod, parseCurePeriod } from './cure';

const days = (n: number, unit: 'calendar' | 'business') => ({ kind: 'days', n, unit });

describe('parseCurePeriod', () => {
  it.each([
    ['10 business days', days(10, 'business')],
    ['5 Business Days', days(5, 'business')],
    ['10 BD', days(10, 'business')],
    ['10bd', days(10, 'business')],
    ['10 b.d.', days(10, 'business')],
    ['3 bus days', days(3, 'business')],
    ['30 days', days(30, 'calendar')],
    ['30 calendar days', days(30, 'calendar')],
    ['30 cal days', days(30, 'calendar')],
    ['15 CD', days(15, 'calendar')],
    ['15d', days(15, 'calendar')],
    ['1 day', days(1, 'calendar')],
    ['10', days(10, 'calendar')],
    ['  10   days  ', days(10, 'calendar')],
  ])('reads %j', (raw, expected) => {
    expect(parseCurePeriod(raw)).toEqual(expected);
  });

  it.each(['No cure date', 'no cure', 'None', 'N/A', 'na', 'not applicable', '-', '—'])(
    'treats %j as an explicit no-cure notice',
    (raw) => {
      expect(parseCurePeriod(raw)).toEqual({ kind: 'none' });
    },
  );

  it.each([
    null,
    undefined,
    '',
    '   ',
    'soon',
    'ten days',
    '0 days',
    '10 fortnights',
    '-5 days',
    '366 days',
    '99999999 days',
  ])('treats %j as unreadable', (raw) => {
    expect(parseCurePeriod(raw)).toEqual({ kind: 'unknown' });
  });
});

describe('describeCurePeriod', () => {
  it('says it in plain words', () => {
    expect(describeCurePeriod(days(10, 'business') as never)).toBe('10 business days');
    expect(describeCurePeriod(days(1, 'calendar') as never)).toBe('1 calendar day');
    expect(describeCurePeriod({ kind: 'none' })).toBe('No cure date');
    expect(describeCurePeriod({ kind: 'unknown' })).toBe('Cure period not readable');
  });
});
