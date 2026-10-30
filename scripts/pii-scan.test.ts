import { describe, expect, it } from 'vitest';
import { findSsnLines } from './pii-scan.mjs';

// Built at runtime so this file doesn't trip the scan it tests.
const dashed = ['123', '45', '6789'].join('-');
const bare = ['123', '45', '6789'].join('');

describe('findSsnLines', () => {
  it('flags dashed and bare nine-digit values, reporting line numbers only', () => {
    expect(findSsnLines(`ok\nSSN ${dashed}\nid ${bare} end`)).toEqual([2, 3]);
  });

  it('flags a value at the end of a sentence', () => {
    expect(findSsnLines(`Her SSN is ${dashed}.`)).toEqual([1]);
  });

  it('ignores digits inside decimals, such as SVG path coordinates', () => {
    expect(findSsnLines('d="M16.9328 0C18.0839 0.000116771 19.1334 0.6588"')).toEqual([]);
  });

  it('ignores digits embedded in hex-like tokens', () => {
    expect(findSsnLines(`key ab${bare}cd and x${bare}`)).toEqual([]);
  });

  it('with dashedOnly, flags only the dashed form', () => {
    expect(findSsnLines(`x ${dashed} y\nz ${bare}`, { dashedOnly: true })).toEqual([1]);
    expect(findSsnLines(`a:${bare}<b`, { dashedOnly: true })).toEqual([]);
  });

  it('ignores phone numbers, longer digit runs and short numbers', () => {
    expect(findSsnLines('call 310-555-1234 or 1234567890 or 12345')).toEqual([]);
  });
});
