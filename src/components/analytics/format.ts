import { format, parseISO } from 'date-fns';
import type { ISODate } from '@/domain/types';

/** "Feb 12 to Oct 12, 2026"; the year shows on both ends only when the range crosses years. */
export function coverageText(from: ISODate, to: ISODate): string {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const start = format(parseISO(from), sameYear ? 'MMM d' : 'MMM d, yyyy');
  return `${start} to ${format(parseISO(to), 'MMM d, yyyy')}`;
}

/** "Feb", or "Feb 2026" when the months span more than one year. */
export function monthLabel(month: string, spansYears: boolean): string {
  return format(parseISO(`${month}-01`), spansYears ? 'MMM yyyy' : 'MMM');
}

export const weekLabel = (monday: ISODate) => format(parseISO(monday), 'MMM d');

export const percent = (rate: number) => `${Math.round(rate * 100)}%`;

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
