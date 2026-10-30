import type { ISODate } from '@/domain/types';
import { parseDate, redactPii } from './normalize';

export interface ParsedNote {
  /** Null when the date was unreadable; the caller supplies a fallback. */
  date: ISODate | null;
  dateWasFixed: boolean;
  text: string;
  redactions: number;
}

export interface ParsedUpdates {
  notes: ParsedNote[];
  /** True when the cell didn't match the "M/D/YY - text; M/D/YY - text" shape. */
  unparsed: boolean;
}

const DATE = '\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}';
const SEPARATOR = new RegExp(`;\\s*(?=${DATE}\\s*[-–—:])`);
const ENTRY = new RegExp(`^(${DATE})\\s*[-–—:]\\s*([\\s\\S]*)$`);

/**
 * Splits Legal's "updates" cell on leading dates. A semicolon only separates entries when a new
 * date follows, so text containing semicolons stays whole. A cell that doesn't fit the shape
 * becomes one undated note, and SSN-shaped text is redacted either way.
 */
export function parseUpdates(cell: string): ParsedUpdates {
  const text = cell.trim();
  if (text === '') return { notes: [], unparsed: false };

  const entries = text.split(SEPARATOR).map((piece) => ENTRY.exec(piece.trim()));
  if (entries.some((m) => m === null)) {
    const { text: safe, redactions } = redactNote(text);
    return {
      notes: [{ date: null, dateWasFixed: false, text: safe, redactions }],
      unparsed: true,
    };
  }

  const notes = entries.map((m) => {
    const parsed = parseDate(m![1]);
    const { text: safe, redactions } = redactNote(m![2].trim());
    return {
      date: parsed?.iso ?? null,
      dateWasFixed: parsed !== null,
      text: safe,
      redactions,
    };
  });
  return { notes, unparsed: notes.some((n) => n.date === null) };
}

function redactNote(text: string): { text: string; redactions: number } {
  const { text: safe, count } = redactPii(text);
  return { text: safe, redactions: count };
}
