import { format } from 'date-fns';
import { z } from 'zod';
import type { ISODate } from '@/domain/types';

const isoDate = z.iso.date();

export const isValidAsOf = (value: string | null | undefined): value is ISODate =>
  isoDate.safeParse(value).success;

export const todayISO = (now: Date = new Date()): ISODate => format(now, 'yyyy-MM-dd');

/** The first valid date among the candidates, else the fallback. */
export function resolveAsOf(
  fallback: ISODate,
  ...candidates: (string | null | undefined)[]
): ISODate {
  return candidates.find(isValidAsOf) ?? fallback;
}
