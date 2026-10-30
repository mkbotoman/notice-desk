// Redacts SSN-shaped and account-number text. Used by ingest and by the AI payload filter.

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
