import { describe, expect, it } from 'vitest';
import { numbersIn, unexpectedNumbers } from './numbers';

describe('numbersIn', () => {
  it('finds figures regardless of formatting', () => {
    expect([...numbersIn('$21,900 owed; 8 overdue, 4.50%, 007 units')].sort()).toEqual([
      '21900',
      '4.5',
      '7',
      '8',
    ]);
  });

  it('ignores number words and returns nothing for plain text', () => {
    expect(numbersIn('three cases are overdue').size).toBe(0);
  });
});

describe('unexpectedNumbers', () => {
  const sources = ['{"overdue":8,"dueSoon":4,"liveAr":"$599,535.09","asOf":"2026-10-13"}'];

  it('accepts figures that appear in the source, in any formatting', () => {
    expect(unexpectedNumbers('8 overdue, 4 due, $599,535.09 owed, as of Oct 13.', sources)).toEqual(
      [],
    );
  });

  it('reports a figure the data never gave', () => {
    expect(unexpectedNumbers('9 overdue and $600,000 owed', sources).sort()).toEqual([
      '600000',
      '9',
    ]);
  });

  it('accepts text with no figures at all', () => {
    expect(unexpectedNumbers('A quiet week.', sources)).toEqual([]);
  });
});
