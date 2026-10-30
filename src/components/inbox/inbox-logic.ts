import { caseDeadline, type CaseDeadlineStatus } from '@/domain/deadline';
import { can, inScope } from '@/domain/permissions';
import { openCases, sortByUrgency, waitingOnPersona } from '@/domain/selectors';
import { leaseSignals, type LeaseSignal } from '@/domain/watchlist';
import type { Case, CoiRecord, ISODate, Lease, Persona } from '@/domain/types';

export type WaitingGroupKey = 'overdue' | 'due_this_week' | 'later' | 'missing' | 'none';

export interface WaitingGroup {
  key: WaitingGroupKey;
  label: string;
  cases: Case[];
}

const GROUPS: { key: WaitingGroupKey; label: string; status: CaseDeadlineStatus }[] = [
  { key: 'overdue', label: 'Overdue', status: 'overdue' },
  { key: 'due_this_week', label: 'Due this week', status: 'due_this_week' },
  { key: 'later', label: 'Later', status: 'upcoming' },
  { key: 'missing', label: 'Deadline missing', status: 'missing' },
  { key: 'none', label: 'No cure deadline', status: 'none' },
];

/** The persona's cases in their team's court, most urgent first within each non-empty group. */
export function groupWaiting(
  cases: readonly Case[],
  persona: Persona,
  asOf: ISODate,
): WaitingGroup[] {
  const sorted = sortByUrgency(waitingOnPersona(cases, persona), asOf);
  return GROUPS.map(({ key, label, status }) => ({
    key,
    label,
    cases: sorted.filter((c) => caseDeadline(c, asOf).status === status),
  })).filter((g) => g.cases.length > 0);
}

export interface TroubledLease {
  lease: Lease;
  signals: LeaseSignal[];
  /** The lease's most urgent open case, if it has one. */
  openCase: Case | null;
}

/**
 * Every lease in the persona's scope that has an open case or at least one signal. A lease with
 * no property is in scope only for all-property personas. Open cases first, then more signals.
 */
export function troubledLeases(
  leases: readonly Lease[],
  cases: readonly Case[],
  coiByLeaseId: ReadonlyMap<string, CoiRecord>,
  persona: Persona,
  asOf: ISODate,
): TroubledLease[] {
  if (!can(persona, 'view_case')) return [];
  const openByLease = new Map<string, Case[]>();
  for (const c of openCases(cases)) {
    if (c.leaseId === null) continue;
    openByLease.set(c.leaseId, [...(openByLease.get(c.leaseId) ?? []), c]);
  }

  const rows: TroubledLease[] = [];
  for (const lease of leases) {
    if (!inScope(persona, lease.propertyId)) continue;
    const signals = leaseSignals(lease, coiByLeaseId.get(lease.id), asOf);
    const open = openByLease.get(lease.id);
    const openCase = open ? sortByUrgency(open, asOf)[0] : null;
    if (signals.length === 0 && !openCase) continue;
    rows.push({ lease, signals, openCase });
  }
  return rows.sort(
    (a, b) =>
      Number(b.openCase !== null) - Number(a.openCase !== null) ||
      b.signals.length - a.signals.length ||
      a.lease.id.localeCompare(b.lease.id),
  );
}
