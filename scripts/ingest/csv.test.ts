import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

const secret = ['123', '45', '6789'].join('-');

describe('parseCsv', () => {
  it('reads quoted fields, embedded commas and newlines, and a BOM', () => {
    const csv = '﻿id,note\n1,"a, b"\n2,"line one\nline two"\n';
    const { rows, columns } = parseCsv(csv);
    expect(columns).toEqual(['id', 'note']);
    expect(rows).toEqual([
      { id: '1', note: 'a, b' },
      { id: '2', note: 'line one\nline two' },
    ]);
  });

  it('fills columns missing from a short row', () => {
    expect(parseCsv('a,b,c\n1,2\n').rows).toEqual([{ a: '1', b: '2', c: '' }]);
  });

  it('removes sensitive columns at the parser, leaving only a presence flag', () => {
    const { rows, columns } = parseCsv(`id,ssn\n1,${secret}\n2,\n3,   \n`, ['ssn']);
    expect(columns).toEqual(['id']);
    expect(rows).toEqual([
      { id: '1', ssn__present: '1' },
      { id: '2', ssn__present: '' },
      { id: '3', ssn__present: '' },
    ]);
    expect(JSON.stringify(rows)).not.toContain(secret);
  });

  it('tolerates a sensitive column that is absent', () => {
    expect(parseCsv('id\n1\n', ['ssn']).rows).toEqual([{ id: '1', ssn__present: '' }]);
  });
});
