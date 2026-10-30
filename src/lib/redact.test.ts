import { describe, expect, it } from 'vitest';
import { redactPii } from './redact';

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
