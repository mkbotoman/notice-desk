import { addDaysISO } from '@/domain/dates';
import { DUE_SOON_DAYS, caseDeadline } from '@/domain/deadline';
import { isTerminal, waitingOn } from '@/domain/stage';
import { STAGES, TEAMS, type Case, type ISODate, type Stage, type Team } from '@/domain/types';

/** Stands in for `Case.propertyId === null` in the `property` param. */
export const UNKNOWN_PROPERTY = 'unknown';

export type DueFilter = 'overdue' | 'week';

export interface CaseFilters {
  q: string;
  stage: Stage | null;
  owner: Team | null;
  /** Property ids, or UNKNOWN_PROPERTY. Empty means every property. */
  property: string[];
  closed: boolean;
  /** Set by the Overdue and Due this week cards. */
  due: DueFilter | null;
}

export const EMPTY_FILTERS: CaseFilters = {
  q: '',
  stage: null,
  owner: null,
  property: [],
  closed: false,
  due: null,
};

/** Reads filters from the URL, ignoring values that don't name a real option. */
export function parseFilters(params: URLSearchParams): CaseFilters {
  const stage = params.get('stage');
  const owner = params.get('owner');
  const due = params.get('due');
  return {
    q: params.get('q') ?? '',
    stage: STAGES.find((s) => s === stage) ?? null,
    owner: TEAMS.find((t) => t === owner) ?? null,
    property: [...new Set(params.getAll('property'))],
    closed: params.get('closed') === '1',
    due: due === 'overdue' || due === 'week' ? due : null,
  };
}

const FILTER_KEYS = ['q', 'stage', 'owner', 'property', 'closed', 'due'];

/** Returns `base` with only the filter params replaced, so `as` and `asOf` pass through. */
export function writeFilters(base: URLSearchParams, filters: CaseFilters): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const key of FILTER_KEYS) next.delete(key);
  if (filters.q.trim() !== '') next.set('q', filters.q);
  if (filters.stage) next.set('stage', filters.stage);
  if (filters.owner) next.set('owner', filters.owner);
  for (const id of filters.property) next.append('property', id);
  if (filters.closed) next.set('closed', '1');
  if (filters.due) next.set('due', filters.due);
  return next;
}

export function hasActiveFilters(f: CaseFilters): boolean {
  return (
    f.q.trim() !== '' ||
    f.stage !== null ||
    f.owner !== null ||
    f.property.length > 0 ||
    f.closed ||
    f.due !== null
  );
}

/** What the search box can match, resolved by the caller from the lookups. */
export interface CaseNames {
  tenant: string;
  property: string;
}

export function filterCases(
  cases: readonly Case[],
  filters: CaseFilters,
  asOf: ISODate,
  names: (c: Case) => CaseNames,
): Case[] {
  const needle = filters.q.trim().toLowerCase();
  const dueStatus = filters.due === 'overdue' ? 'overdue' : 'due_this_week';
  return cases.filter((c) => {
    if (!filters.closed && isTerminal(c.stage)) return false;
    if (filters.stage && c.stage !== filters.stage) return false;
    if (filters.owner && waitingOn(c) !== filters.owner) return false;
    if (
      filters.property.length > 0 &&
      !filters.property.includes(c.propertyId ?? UNKNOWN_PROPERTY)
    ) {
      return false;
    }
    if (filters.due && caseDeadline(c, asOf).status !== dueStatus) return false;
    if (needle !== '') {
      const n = names(c);
      if (!`${n.tenant} ${n.property}`.toLowerCase().includes(needle)) return false;
    }
    return true;
  });
}

export const GROUP_KEYS = ['overdue', 'week', 'later', 'missing', 'none', 'closed'] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

export function groupKey(c: Case, asOf: ISODate): GroupKey {
  if (isTerminal(c.stage)) return 'closed';
  switch (caseDeadline(c, asOf).status) {
    case 'overdue':
      return 'overdue';
    case 'due_this_week':
      return 'week';
    case 'upcoming':
      return 'later';
    case 'missing':
      return 'missing';
    case 'none':
      return 'none';
  }
}

export interface CaseGroup {
  key: GroupKey;
  cases: Case[];
}

/** Splits cases that are already in urgency order into the page's groups, dropping empty ones. */
export function groupCases(sorted: readonly Case[], asOf: ISODate): CaseGroup[] {
  const buckets = new Map<GroupKey, Case[]>();
  for (const c of sorted) {
    const key = groupKey(c, asOf);
    buckets.set(key, [...(buckets.get(key) ?? []), c]);
  }
  return GROUP_KEYS.filter((key) => buckets.has(key)).map((key) => ({
    key,
    cases: buckets.get(key) ?? [],
  }));
}

export interface TeamStats {
  total: number;
  overdue: number;
  dueThisWeek: number;
}

export interface CaseStats {
  overdue: number;
  dueThisWeek: number;
  /** Earliest cure deadline among overdue cases. */
  oldestOverdue: ISODate | null;
  weekEnd: ISODate;
  waiting: Record<Team, TeamStats>;
}

/** Card figures for a set of open cases. */
export function caseStats(open: readonly Case[], asOf: ISODate): CaseStats {
  const stats: CaseStats = {
    overdue: 0,
    dueThisWeek: 0,
    oldestOverdue: null,
    weekEnd: addDaysISO(asOf, DUE_SOON_DAYS),
    waiting: {
      legal: { total: 0, overdue: 0, dueThisWeek: 0 },
      asset_management: { total: 0, overdue: 0, dueThisWeek: 0 },
    },
  };
  for (const c of open) {
    const { status, deadline } = caseDeadline(c, asOf);
    const team = waitingOn(c);
    const bucket = team ? stats.waiting[team] : null;
    if (bucket) bucket.total += 1;
    if (status === 'overdue') {
      stats.overdue += 1;
      if (bucket) bucket.overdue += 1;
      if (deadline && (stats.oldestOverdue === null || deadline < stats.oldestOverdue)) {
        stats.oldestOverdue = deadline;
      }
    } else if (status === 'due_this_week') {
      stats.dueThisWeek += 1;
      if (bucket) bucket.dueThisWeek += 1;
    }
  }
  return stats;
}
