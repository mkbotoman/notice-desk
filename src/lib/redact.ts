// Redacts SSN-shaped and account-number text. Used by ingest and by the AI payload filter.

/**
 * Makes look-alike text comparable before matching: full-width and other compatibility digits
 * become ASCII, every dash variant becomes "-", and invisible format and control characters
 * (zero-width spaces, bidi marks) are removed, so none of them can be used to hide a number.
 */
export function normalizeSensitive(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/(?![\n\r\t])[\p{Cc}\p{Cf}]/gu, '');
}

const SEP = '[-.\\s]{0,3}';
// 3-2-4 digits with any run of dashes, dots or whitespace (line breaks included) between groups.
const SSN = new RegExp(`(?<![\\w.])\\d{3}${SEP}\\d{2}${SEP}\\d{4}(?!\\w|\\.\\d)`, 'g');
// Nine digits written one at a time: "1 2 3 4 5 6 7 8 9".
const SPACED = /(?<!\d)(?:\d[\s.-]){8}\d(?!\d)/g;
/**
 * Account and routing numbers: a long digit run only counts when an account keyword sits just
 * before it. A bare 8-digit run is as likely to be a docket or reference number. Groups may be
 * separated by a space or dash.
 */
const ACCOUNT = /(?<=\b(?:account|acct|routing|aba|iban)\b[^\d]{0,20})\d(?:[\s-]?\d){7,16}(?!\d)/gi;

export interface Redaction {
  text: string;
  count: number;
}

/** Returns the text with sensitive-looking values replaced. The text is returned normalized. */
export function redactPii(text: string): Redaction {
  let count = 0;
  const swap = () => {
    count += 1;
    return '[redacted]';
  };
  const clean = normalizeSensitive(text);
  return { text: clean.replace(SSN, swap).replace(SPACED, swap).replace(ACCOUNT, swap), count };
}

/** For short fields a client supplies (a tenant name, a suite): normalized, redacted, trimmed. */
export const cleanFact = (value: string): string => redactPii(value).text.trim();
