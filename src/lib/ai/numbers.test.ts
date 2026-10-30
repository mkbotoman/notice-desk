import { describe, expect, it } from 'vitest';
import { introducesLink, numbersIn, unexpectedFigures, unexpectedNumbers } from './numbers';

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

describe('unexpectedFigures', () => {
  const sources = [
    '{"overdue":8,"asOf":"2026-10-13","deadline":"2026-09-17","amount":"$599,535.09"}',
  ];
  const dates = ['2026-10-13', '2026-09-17'];

  it('accepts figures and dates the data gave, in written form', () => {
    expect(
      unexpectedFigures(
        '8 overdue; the oldest was due Sep 17 and the week ended Tue, Oct 13, 2026.',
        sources,
        dates,
      ),
    ).toEqual([]);
    expect(unexpectedFigures('Balance $599,535.09.', sources, dates)).toEqual([]);
  });

  it('does not let a count borrow a number from a date', () => {
    expect(unexpectedFigures('13 cases are overdue.', sources, dates)).toEqual(['13']);
    expect(unexpectedFigures('There were 9 cases.', sources, dates)).toEqual(['9']);
  });

  it('rejects a date the data never gave, in either form', () => {
    expect(unexpectedFigures('Due Oct 29.', sources, dates)).toEqual(['Oct 29']);
    expect(unexpectedFigures('Due 2026-12-01.', sources, dates)).toEqual(['2026-12-01']);
  });

  it('allows dates the person wrote in their own text, in any format', () => {
    expect(unexpectedFigures('Pay by November 3.', ['Please pay by Nov 3'], [])).toEqual([]);
    expect(unexpectedFigures('Pay by Nov 4.', ['Please pay by Nov 3'], [])).toEqual(['Nov 4']);
  });
});

describe('introducesLink', () => {
  it('flags web and email addresses that are not in the sources', () => {
    expect(introducesLink('See https://example.com now', ['nothing here'])).toBe(true);
    expect(introducesLink('Visit www.example.com', [])).toBe(true);
    expect(introducesLink('Write to a.b@example.org', [])).toBe(true);
  });

  it('allows a link the data itself contained, and plain text', () => {
    expect(introducesLink('Open /cases/N-001 or https://x.test/a', ['https://x.test/a'])).toBe(
      false,
    );
    expect(introducesLink('No links in this sentence.', [])).toBe(false);
  });
});
