/**
 * The guard behind "every number must come from the data". AI text is checked after the fact:
 * any figure the model wrote that isn't in the source material means the text is rejected and
 * the template is used instead.
 */

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/** "1,234.50" becomes "1234.5" and "007" becomes "7", so formatting differences don't matter. */
function normalize(token: string): string {
  const plain = token.replace(/,/g, '');
  const value = Number(plain);
  return Number.isFinite(value) ? String(value) : plain;
}

/** Every distinct numeric figure in the text, normalized. Words like "three" are not figures. */
export function numbersIn(text: string): Set<string> {
  return new Set((text.match(NUMBER) ?? []).map(normalize));
}

/**
 * The figures in `text` that appear nowhere in `sources`. An empty result means every figure
 * the model wrote can be traced to the data it was given.
 */
export function unexpectedNumbers(text: string, sources: readonly string[]): string[] {
  const allowed = new Set(sources.flatMap((s) => [...numbersIn(s)]));
  return [...numbersIn(text)].filter((n) => !allowed.has(n));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const DATE_PHRASE =
  /\b(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+)?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})\b/g;

const keyOf = (month: string, day: string | number) =>
  `${month.slice(0, 3).toLowerCase()} ${Number(day)}`;
const isoKey = (iso: string) => keyOf(MONTHS[Number(iso.slice(5, 7)) - 1] ?? '', iso.slice(8, 10));

/**
 * Like `unexpectedNumbers`, but dates are judged as dates, not as loose numbers. A day of the
 * month ("Oct 13") must be a date the data actually gave, and the pieces of a date (the 13 in
 * the as-of date) no longer count as permission to write "13 cases". `dates` are ISO dates the
 * data gave; dates written in `sources` (the person's own wording) are allowed too.
 */
export function unexpectedFigures(
  text: string,
  sources: readonly string[],
  dates: readonly string[] = [],
): string[] {
  const allowedDates = new Set(dates.map(isoKey));
  const joined = sources.join('\n');
  for (const m of joined.matchAll(ISO)) allowedDates.add(isoKey(m[0]));
  for (const m of joined.matchAll(DATE_PHRASE)) allowedDates.add(keyOf(m[1], m[2]));
  // Keep each date's year as a plain number; drop the rest of the date.
  const sourceText = joined.replace(ISO, '$1').replace(DATE_PHRASE, ' ');

  const badDates: string[] = [];
  const rest = text
    .replace(DATE_PHRASE, (whole, month: string, day: string) => {
      if (!allowedDates.has(keyOf(month, day))) badDates.push(whole.trim());
      return ' ';
    })
    .replace(ISO, (whole, year: string) => {
      if (!allowedDates.has(isoKey(whole))) badDates.push(whole);
      return year;
    });
  return [...badDates, ...unexpectedNumbers(rest, [sourceText])];
}

const LINK = /https?:\/\/\S+|\bwww\.\S+|[\w.+-]+@[\w-]+\.[\w.]+/gi;

/** True if the text contains a web address or email address that the sources don't. */
export function introducesLink(text: string, sources: readonly string[]): boolean {
  const known = sources.join('\n').toLowerCase();
  return (text.match(LINK) ?? []).some((link) => !known.includes(link.toLowerCase()));
}
