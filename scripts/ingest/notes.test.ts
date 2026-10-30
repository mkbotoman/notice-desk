import { describe, expect, it } from 'vitest';
import { parseUpdates } from './notes';

const ssn = ['123', '45', '6789'].join('-');

describe('parseUpdates', () => {
  it('splits dated entries on semicolons', () => {
    const { notes, unparsed } = parseUpdates(
      '9/28/26 - Notice sent; 10/5/26 - Promised payment by Friday; 10/9/26 - Nothing received',
    );
    expect(unparsed).toBe(false);
    expect(notes.map((n) => [n.date, n.text])).toEqual([
      ['2026-09-28', 'Notice sent'],
      ['2026-10-05', 'Promised payment by Friday'],
      ['2026-10-09', 'Nothing received'],
    ]);
    expect(notes.every((n) => n.dateWasFixed)).toBe(true);
  });

  it('keeps semicolons that are not followed by a date', () => {
    const { notes } = parseUpdates(
      '9/28/26 - Sent; tenant disputes the amount; 10/1/26 - Resolved',
    );
    expect(notes.map((n) => n.text)).toEqual(['Sent; tenant disputes the amount', 'Resolved']);
  });

  it('accepts other dashes, a colon, and four-digit years', () => {
    const { notes } = parseUpdates('09/28/2026 – Sent; 10/01/2026: Followed up');
    expect(notes.map((n) => n.date)).toEqual(['2026-09-28', '2026-10-01']);
  });

  it('returns nothing for a blank cell', () => {
    expect(parseUpdates('  ')).toEqual({ notes: [], unparsed: false });
  });

  it('keeps a cell that does not fit the shape as one undated note', () => {
    const { notes, unparsed } = parseUpdates('Called tenant; waiting on payment');
    expect(unparsed).toBe(true);
    expect(notes).toEqual([
      { date: null, dateWasFixed: false, text: 'Called tenant; waiting on payment', redactions: 0 },
    ]);
  });

  it('flags an entry whose date is impossible, keeping its text', () => {
    const { notes, unparsed } = parseUpdates('2/30/26 - Sent');
    expect(unparsed).toBe(true);
    expect(notes[0]).toMatchObject({ date: null, dateWasFixed: false, text: 'Sent' });
  });

  it('redacts SSN-shaped text in both the structured and the fallback paths', () => {
    const structured = parseUpdates(`9/28/26 - Guarantor ${ssn} confirmed`);
    expect(structured.notes[0]).toMatchObject({
      text: 'Guarantor [redacted] confirmed',
      redactions: 1,
    });
    const fallback = parseUpdates(`no dates but ${ssn}`);
    expect(fallback.notes[0]).toMatchObject({ text: 'no dates but [redacted]', redactions: 1 });
  });
});
