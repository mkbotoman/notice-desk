import { addDaysISO, daysBetween, isWeekend } from './dates';
import { FIRST_SUPPORTED_YEAR, holidayOn, type Holiday } from './holidays';
import type { Case, CurePeriod, ISODate } from './types';

/** "Due this week" is a rolling window: today through the next 7 days. */
export const DUE_SOON_DAYS = 7;

export interface DeadlineDetail {
  deadline: ISODate;
  /** Weekday holidays that were skipped while counting business days. */
  skippedHolidays: Holiday[];
}

/**
 * Day 1 is the day after the notice is sent. For business days, day 1 is the next business day
 * after the send date (so a notice sent on a Friday starts counting Monday).
 * Returns null when there is nothing to calculate.
 */
export function cureDeadlineDetail(
  dateSent: ISODate | null,
  cure: CurePeriod,
): DeadlineDetail | null {
  if (dateSent === null || cure.kind !== 'days') return null;
  if (cure.unit === 'calendar') {
    return { deadline: addDaysISO(dateSent, cure.n), skippedHolidays: [] };
  }

  // Before the holiday calendar begins, business days can't be counted: no deadline, not a crash.
  if (Number(dateSent.slice(0, 4)) < FIRST_SUPPORTED_YEAR) return null;

  const skippedHolidays: Holiday[] = [];
  let current = dateSent;
  let counted = 0;
  while (counted < cure.n) {
    current = addDaysISO(current, 1);
    if (isWeekend(current)) continue;
    const holiday = holidayOn(current);
    if (holiday) {
      skippedHolidays.push(holiday);
      continue;
    }
    counted += 1;
  }
  return { deadline: current, skippedHolidays };
}

export function cureDeadline(dateSent: ISODate | null, cure: CurePeriod): ISODate | null {
  return cureDeadlineDetail(dateSent, cure)?.deadline ?? null;
}

export type DeadlineStatus = 'overdue' | 'due_this_week' | 'upcoming' | 'none';

/** A deadline on asOf itself is still due today, not overdue. */
export function deadlineStatus(deadline: ISODate | null, asOf: ISODate): DeadlineStatus {
  if (deadline === null) return 'none';
  const days = daysBetween(asOf, deadline);
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'due_this_week';
  return 'upcoming';
}

/** `missing` means the case needs a deadline and does not have a usable one. */
export type CaseDeadlineStatus = DeadlineStatus | 'missing';

export interface CaseDeadline {
  deadline: ISODate | null;
  status: CaseDeadlineStatus;
  /** Days from asOf to the deadline; negative when overdue. Null with no deadline. */
  daysUntil: number | null;
}

/**
 * The deadline only counts while the case is in Notice to Cure. In Default and later the cure
 * period has ended by definition, so the date is history and carries no overdue flag.
 */
export function caseDeadline(c: Case, asOf: ISODate): CaseDeadline {
  const deadline = cureDeadline(c.dateSent, c.curePeriod);
  const daysUntil = deadline === null ? null : daysBetween(asOf, deadline);
  if (c.stage !== 'notice_to_cure') return { deadline, status: 'none', daysUntil };

  const unreadable =
    c.curePeriod.kind === 'unknown' || (c.curePeriod.kind === 'days' && deadline === null);
  if (unreadable) return { deadline, status: 'missing', daysUntil };
  return { deadline, status: deadlineStatus(deadline, asOf), daysUntil };
}
