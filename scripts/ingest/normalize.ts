import { format } from 'date-fns';
import type { ISODate } from '@/domain/types';
import { ENTITY_SUFFIXES, type EnumTable } from './rules/config';

// ---------- dates ----------

export interface ParsedDate {
  iso: ISODate;
  /** True when the source already used ISO; anything else is reported as a fix (DQ-DATE). */
  standard: boolean;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Two-digit years below this pivot read as 20xx, the rest as 19xx. */
const YEAR_PIVOT = 70;

function validDate(year: number, month: number, day: number): ISODate | null {
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return format(d, 'yyyy-MM-dd');
}

const fullYear = (y: number) => (y >= 100 ? y : y + (y < YEAR_PIVOT ? 2000 : 1900));

/**
 * Reads ISO, month-first slash dates (the profile showed month-first), month-name dates and Excel
 * serials. Returns null for blank or unreadable input; use `isBlank` to tell them apart.
 */
export function parseDate(raw: string): ParsedDate | null {
  const text = raw.trim();
  let match: RegExpExecArray | null;

  if ((match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text))) {
    const iso = validDate(+match[1], +match[2], +match[3]);
    return iso ? { iso, standard: true } : null;
  }
  if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text))) {
    const iso = validDate(fullYear(+match[3]), +match[1], +match[2]);
    return iso ? { iso, standard: false } : null;
  }
  if ((match = /^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(text))) {
    const month = MONTHS.indexOf(match[1].slice(0, 3).toLowerCase()) + 1;
    const iso = month > 0 ? validDate(+match[3], month, +match[2]) : null;
    return iso ? { iso, standard: false } : null;
  }
  if ((match = /^(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})$/i.exec(text))) {
    const month = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
    const iso = month > 0 ? validDate(+match[3], month, +match[1]) : null;
    return iso ? { iso, standard: false } : null;
  }
  if (/^\d{5}$/.test(text)) {
    // Excel counts days from 1899-12-30 (its 1900 leap-year quirk is baked into that origin).
    const d = new Date(1899, 11, 30 + Number(text));
    return { iso: format(d, 'yyyy-MM-dd'), standard: false };
  }
  return null;
}

export const isBlank = (raw: string | undefined): boolean => (raw ?? '').trim() === '';

// ---------- money ----------

export type ParsedMoney =
  { kind: 'blank' } | { kind: 'text' } | { kind: 'amount'; cents: number; standard: boolean };

/** Parses "$1,234.50", "(500.00)", "-12", "1234". Anything else with letters is text. */
export function parseMoney(raw: string): ParsedMoney {
  const text = raw.trim();
  if (text === '') return { kind: 'blank' };

  const negative = /^\(.*\)$/.test(text) || text.startsWith('-');
  const digits = text.replace(/[()$,\s-]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(digits)) return { kind: 'text' };

  const [whole, fraction = ''] = digits.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return {
    kind: 'amount',
    cents: negative ? -cents : cents,
    standard: /^-?\d+(\.\d{1,2})?$/.test(text),
  };
}

// ---------- enums ----------

export type EnumResult<T> =
  | { status: 'blank' }
  | { status: 'standard'; value: T }
  | { status: 'alias'; value: T }
  | { status: 'unknown' };

const key = (raw: string) => raw.trim().toLowerCase().replace(/\s+/g, ' ');

export function mapEnum<T extends string>(raw: string, table: EnumTable<T>): EnumResult<T> {
  if (isBlank(raw)) return { status: 'blank' };
  const k = key(raw);
  if (k in table.standard) return { status: 'standard', value: table.standard[k] };
  if (k in table.aliases) return { status: 'alias', value: table.aliases[k] };
  return { status: 'unknown' };
}

// ---------- names ----------

const SUFFIX_TAIL = new RegExp(`(?:\\s+(?:${ENTITY_SUFFIXES.join('|')}))+$`);

/** For comparing tenant names only: case, punctuation, entity suffixes, "dba" tails, leading "The". */
export function normalizeName(name: string): string {
  const withoutDba = name.toLowerCase().replace(/\bd\/?b\/?a\b.*$/, '');
  const text = withoutDba
    .replace(/&/g, ' and ')
    .replace(/[.,'"’]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stripped = text
    .replace(SUFFIX_TAIL, '')
    .replace(/^the\s+/, '')
    .trim();
  // A name that is nothing but an entity suffix still has to stay distinct.
  return stripped === '' ? text : stripped;
}

export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current.push(
        Math.min(
          previous[j] + 1,
          current[j - 1] + 1,
          previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

export const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Is `alias` a believable short form of the property's name (abbreviation, initials, or the
 * name with its city)? Used to decide whether a notice's property_name is harmless (DQ-PROP).
 */
export function isPlausibleAlias(alias: string, propertyName: string, city: string): boolean {
  const words = [...propertyName.toLowerCase().split(/\s+/), ...city.toLowerCase().split(/\s+/)];
  const initials = propertyName
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w[0])
    .join('');
  const isSubsequence = (small: string, big: string) => {
    let i = 0;
    for (const ch of big) if (ch === small[i]) i += 1;
    return i === small.length;
  };
  return alias
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .every(
      (token) =>
        words.includes(token) ||
        isSubsequence(token, initials) ||
        words.some((w) => w[0] === token[0] && isSubsequence(token, w)),
    );
}

// ---------- PII ----------

const SSN = /(?<![\w.])\d{3}[- ]?\d{2}[- ]?\d{4}(?!\w|\.\d)/g;
/**
 * Account and routing numbers: a long digit run only counts when an account keyword sits just
 * before it. A bare 8-digit run is as likely to be a docket or reference number.
 */
const ACCOUNT = /(?<=\b(?:account|acct|routing|aba|iban)\b[^\d]{0,20})\d{8,17}(?!\w|\.\d)/gi;

export interface Redaction {
  text: string;
  count: number;
}

export function redactPii(text: string): Redaction {
  let count = 0;
  const swap = () => {
    count += 1;
    return '[redacted]';
  };
  return { text: text.replace(SSN, swap).replace(ACCOUNT, swap), count };
}
