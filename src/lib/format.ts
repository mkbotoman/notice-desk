import { format, parseISO } from 'date-fns';
import type { ChipTone } from '@/components/ui/chip';
import type { CaseDeadlineStatus } from '@/domain/deadline';
import type { Cents, ISODate, IssueType, Stage, Team } from '@/domain/types';

/** Always with cents: "$21,900.00", "$21,900.50". Null shows as an em dash. */
export function formatCents(cents: Cents | null): string {
  if (cents === null) return '—';
  const dollars = Math.abs(cents) / 100;
  const text = dollars.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${cents < 0 ? '-' : ''}$${text}`;
}

export const shortDate = (iso: ISODate) => format(parseISO(iso), 'MMM d');
export const weekdayDate = (iso: ISODate) => format(parseISO(iso), 'EEE, MMM d');
export const longDate = (iso: ISODate) => format(parseISO(iso), 'EEE, MMM d, yyyy');

/** "3 days overdue", "due today", "in 2 days". */
export function describeDays(daysUntil: number): string {
  const plural = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  if (daysUntil < 0) return `${plural(-daysUntil)} overdue`;
  if (daysUntil === 0) return 'due today';
  return `in ${plural(daysUntil)}`;
}

export const STAGE_LABELS: Record<Stage, string> = {
  non_compliant: 'Non-compliant',
  notice_to_cure: 'Notice to Cure',
  default: 'Default',
  collections: 'Collections',
  cured: 'Cured',
  closed: 'Closed',
};

export const STAGE_TONES: Record<Stage, ChipTone> = {
  non_compliant: 'outline',
  notice_to_cure: 'navy',
  default: 'solid',
  collections: 'gray',
  cured: 'success',
  closed: 'gray',
};

/** The button for each move, by the stage it leads to. */
export const ADVANCE_LABELS: Record<Stage, string> = {
  non_compliant: 'Move to Non-compliant',
  notice_to_cure: 'Send Notice to Cure',
  default: 'Move to Default',
  collections: 'Move to Collections',
  cured: 'Mark cured',
  closed: 'Close case',
};

export const ISSUE_LABELS: Record<IssueType, string> = {
  monetary: 'Monetary',
  insurance: 'Insurance',
  other_lease_term: 'Other lease term',
};

/** Short form for chips and tables: "Legal", "Asset Mgmt". */
export const TEAM_LABELS: Record<Team, string> = {
  legal: 'Legal',
  asset_management: 'Asset Mgmt',
};

export const DEADLINE_TONES: Record<CaseDeadlineStatus, ChipTone> = {
  overdue: 'danger',
  due_this_week: 'warning',
  upcoming: 'gray',
  none: 'gray',
  missing: 'warning',
};
