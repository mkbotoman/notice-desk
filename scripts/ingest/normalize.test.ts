import { describe, expect, it } from 'vitest';
import {
  editDistance,
  isBlank,
  isPlausibleAlias,
  mapEnum,
  normalizeName,
  parseDate,
  parseMoney,
  redactPii,
  slug,
} from './normalize';
import { STAGE_TABLE } from './rules/config';

const ssn = ['123', '45', '6789'].join('-');
const ssnBare = ['123', '45', '6789'].join('');
const routing = ['0210', '00021'].join('');

describe('parseDate', () => {
  it.each([
    ['2026-09-28', '2026-09-28', true],
    ['9/28/2026', '2026-09-28', false],
    ['09/28/26', '2026-09-28', false],
    ['9/28/99', '1999-09-28', false],
    ['Sept 28 2026', '2026-09-28', false],
    ['September 28, 2026', '2026-09-28', false],
    ['sep. 28, 2026', '2026-09-28', false],
    ['28 Sep 2026', '2026-09-28', false],
    ['28 September, 2026', '2026-09-28', false],
    ['46293', '2026-09-28', false],
    ['  2026-09-28  ', '2026-09-28', true],
  ])('reads %j', (raw, iso, standard) => {
    expect(parseDate(raw)).toEqual({ iso, standard });
  });

  it.each([
    '',
    'soon',
    '2026-02-30',
    '13/45/2026',
    '2026-9-28',
    'Foo 28 2026',
    '28 Foo 2026',
    '9/31/2026',
  ])('rejects %j', (raw) => {
    expect(parseDate(raw)).toBeNull();
  });

  it('reads month-first slash dates, as the profile showed', () => {
    expect(parseDate('3/4/2026')?.iso).toBe('2026-03-04');
  });
});

describe('parseMoney', () => {
  it.each([
    ['4100.00', 410000, true],
    ['4100', 410000, true],
    ['4100.5', 410050, true],
    ['$1,234.50', 123450, false],
    ['1,234', 123400, false],
    ['(500.00)', -50000, false],
    ['-12.34', -1234, true],
    ['  18450.00 ', 1845000, true],
    ['0.00', 0, true],
  ])('reads %j', (raw, cents, standard) => {
    expect(parseMoney(raw)).toEqual({ kind: 'amount', cents, standard });
  });

  it('tells blank from text', () => {
    expect(parseMoney('  ')).toEqual({ kind: 'blank' });
    for (const raw of ['TBD', 'Pending', '12.345', '$', '1.2.3']) {
      expect(parseMoney(raw)).toEqual({ kind: 'text' });
    }
  });
});

describe('mapEnum', () => {
  it('separates standard spellings, aliases, unknowns and blanks', () => {
    expect(mapEnum('Notice to Cure', STAGE_TABLE)).toEqual({
      status: 'standard',
      value: 'notice_to_cure',
    });
    expect(mapEnum('  NOTICE   TO CURE ', STAGE_TABLE)).toEqual({
      status: 'standard',
      value: 'notice_to_cure',
    });
    expect(mapEnum('NTC', STAGE_TABLE)).toEqual({ status: 'alias', value: 'notice_to_cure' });
    expect(mapEnum('Sorta Default', STAGE_TABLE)).toEqual({ status: 'unknown' });
    expect(mapEnum('   ', STAGE_TABLE)).toEqual({ status: 'blank' });
  });
});

describe('normalizeName', () => {
  it.each([
    ['Brightside Fitness LLC', 'brightside fitness'],
    ['Brightside Fitness, L.L.C.', 'brightside fitness'],
    ['BrightSide Fitness', 'brightside fitness'],
    ['The Coffee Co., Inc.', 'coffee'],
    ['Acme Corp Inc', 'acme'],
    ['Smith & Sons', 'smith and sons'],
    ["Joe's Pizza", 'joes pizza'],
    ['Acme LLC dba Joe Pizza', 'acme'],
    ['Acme LLC d/b/a Joe Pizza', 'acme'],
    ['LLC', 'llc'],
  ])('%j -> %j', (raw, expected) => {
    expect(normalizeName(raw)).toBe(expected);
  });
});

describe('small helpers', () => {
  it('computes edit distance', () => {
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('same', 'same')).toBe(0);
  });

  it('slugs names and detects blanks', () => {
    expect(slug("  Lena  Brooks-O'Neil! ")).toBe('lena-brooks-o-neil');
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank(' \t')).toBe(true);
    expect(isBlank('x')).toBe(false);
  });
});

describe('isPlausibleAlias', () => {
  it.each([
    ['Harbor Cmns', 'Harbor Commons', 'Long Beach'],
    ['Desert Bloom Ctr', 'Desert Bloom Center', 'Mesa'],
    ['PW', 'Park West Plaza', 'Reno'],
    ['CP Denver', 'Central Park Square', 'Denver'],
  ])('accepts %j for %j', (alias, name, city) => {
    expect(isPlausibleAlias(alias, name, city)).toBe(true);
  });

  it('rejects a name that has nothing to do with the property', () => {
    expect(isPlausibleAlias('Riverside Mall', 'Harbor Commons', 'Long Beach')).toBe(false);
  });
});

describe('redactPii', () => {
  it('redacts SSN shapes and counts them, without keeping the value', () => {
    const out = redactPii(`Guarantor ${ssn} and ${ssnBare} and 123 45 6789 called`);
    expect(out.count).toBe(3);
    expect(out.text).toBe('Guarantor [redacted] and [redacted] and [redacted] called');
  });

  it('redacts a long number only when an account keyword precedes it', () => {
    expect(redactPii('Wire to account # 123456789012').text).toBe('Wire to account # [redacted]');
    expect(redactPii(`ACH routing ${routing} ok`).text).toBe('ACH routing [redacted] ok');
    expect(redactPii('Docket # 12345678)').count).toBe(0);
  });

  it('leaves money, case numbers and ordinary text alone', () => {
    const safe = 'Paid $18,450.00 on case 26-123-456, ref 1234567 and 12 days';
    expect(redactPii(safe)).toEqual({ text: safe, count: 0 });
  });
});
