import { describe, expect, it } from 'vitest';
import { cleanFact, normalizeSensitive, redactPii } from './redact';

const ssn = ['123', '45', '6789'].join('-');

describe('redactPii', () => {
  it('redacts SSN shapes and counts them', () => {
    expect(redactPii(`SSN ${ssn} and ${ssn.replace(/-/g, ' ')}`)).toEqual({
      text: 'SSN [redacted] and [redacted]',
      count: 2,
    });
  });

  it('redacts an account number only after an account keyword', () => {
    expect(redactPii(`acct # ${['1234', '5678', '9012'].join('')}`).count).toBe(1);
    expect(redactPii(`docket ${['1234', '5678'].join('')}`).count).toBe(0);
  });

  it('leaves ordinary text alone', () => {
    expect(redactPii('Paid $18,450.00 by Oct 13.')).toEqual({
      text: 'Paid $18,450.00 by Oct 13.',
      count: 0,
    });
  });
});

describe('redactPii against disguised numbers', () => {
  const [a, b, c] = ['123', '45', '6789'];
  const fullWidth = (text: string) =>
    [...text]
      .map((ch) => (/\d/.test(ch) ? String.fromCharCode(ch.charCodeAt(0) + 0xfee0) : ch))
      .join('');
  const hidden = (text: string) => {
    const { text: out, count } = redactPii(`ref: ${text} end`);
    return { out, count };
  };

  it.each([
    ['full-width digits', fullWidth(`${a}-${b}-${c}`)],
    ['a zero-width space inside the number', `${a}\u200b-${b}-${c}`],
    ['a line break between groups', `${a}-${b}-\n${c}`],
    ['spaces around the dashes', `${a} - ${b} - ${c}`],
    ['dots as separators', `${a}.${b}.${c}`],
    ['en dashes', `${a}\u2013${b}\u2013${c}`],
    ['minus signs', `${a}\u2212${b}\u2212${c}`],
    ['digits written one at a time', [...`${a}${b}${c}`].join(' ')],
    ['a bidi mark', `${a}\u200e-${b}-${c}`],
  ])('redacts an SSN written with %s', (_label, value) => {
    const { out, count } = hidden(value);
    expect(count).toBe(1);
    expect(out).toBe('ref: [redacted] end');
  });

  it.each([
    ['full-width digits after a keyword', `acct: ${fullWidth('123456789012')}`],
    ['digits in groups of four', 'acct 1234 5678 9012'],
    ['dashed groups', 'account no. 1234-5678-9012'],
  ])('redacts an account number written with %s', (_label, value) => {
    expect(redactPii(value).count).toBe(1);
  });

  it('leaves money, dates, times, phone numbers and amounts alone', () => {
    for (const safe of [
      'Balance $599,535.09 as of 2026-10-13 09:30.',
      'Call 310-555-1234 or 310 555 1234.',
      'Invoice 1,234,567.89 and 12.5% on Oct 13, 2026.',
      'Suite 110, unit 4B, case N-001.',
    ]) {
      expect(redactPii(safe)).toEqual({ text: safe, count: 0 });
    }
  });

  it('normalizes look-alike characters and strips invisible ones, keeping line breaks', () => {
    expect(normalizeSensitive('A\u200bB\u2013C\nD')).toBe('AB-C\nD');
    expect(normalizeSensitive(fullWidth('12'))).toBe('12');
  });

  it('cleans a short field supplied by a client', () => {
    expect(cleanFact(`  Harbor ${a}-${b}-${c}\u200b  `)).toBe('Harbor [redacted]');
  });
});
