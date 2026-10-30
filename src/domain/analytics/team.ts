import { addMonths, addWeeks, format, parseISO, startOfISOWeek } from 'date-fns';
import { caseDeadline } from '../deadline';
import { isTerminal } from '../stage';
import {
  STAGES,
  TEAMS,
  type Case,
  type CaseEvent,
  type ISODate,
  type Lease,
  type Person,
  type Property,
  type Stage,
  type Team,
} from '../types';

const compareLabels = (a: { label: string }, b: { label: string }) =>
  a.label.localeCompare(b.label);

export interface StageCount {
  stage: Stage;
  count: number;
}

/** Open stages only, in pipeline order. */
export function stageCounts(cases: readonly Case[]): StageCount[] {
  return STAGES.filter((stage) => !isTerminal(stage)).map((stage) => ({
    stage,
    count: cases.filter((c) => c.stage === stage).length,
  }));
}

export interface DueCounts {
  overdue: number;
  dueThisWeek: number;
}

/** Counts follow the deadline rules: only Notice to Cure cases can be overdue or due soon. */
export function dueCounts(open: readonly Case[], asOf: ISODate): DueCounts {
  const statuses = open.map((c) => caseDeadline(c, asOf).status);
  return {
    overdue: statuses.filter((s) => s === 'overdue').length,
    dueThisWeek: statuses.filter((s) => s === 'due_this_week').length,
  };
}

export interface MonthCount {
  /** 'yyyy-MM' */
  month: string;
  count: number;
}

export interface SentTimeline {
  months: MonthCount[];
  from: ISODate | null;
  to: ISODate | null;
  undated: number;
}

/** Months from `first` to `last` inclusive, so quiet months show as zero instead of vanishing. */
function monthKeys(first: ISODate, last: ISODate): string[] {
  const keys: string[] = [];
  const end = last.slice(0, 7);
  for (
    let m = parseISO(`${first.slice(0, 7)}-01`);
    format(m, 'yyyy-MM') <= end;
    m = addMonths(m, 1)
  ) {
    keys.push(format(m, 'yyyy-MM'));
  }
  return keys;
}

/**
 * Cases by the month the notice went out. A case with no send date falls back to the day it was
 * opened in the app; a case with neither is counted as undated, not guessed.
 */
export function sentTimeline(
  cases: readonly Case[],
  eventsByCase: ReadonlyMap<string, readonly CaseEvent[]>,
): SentTimeline {
  const dates: ISODate[] = [];
  for (const c of cases) {
    const opened = eventsByCase.get(c.id)?.find((e) => e.type === 'case_opened');
    const date = c.dateSent ?? opened?.effectiveDate ?? null;
    if (date !== null) dates.push(date);
  }
  const undated = cases.length - dates.length;
  if (dates.length === 0) return { months: [], from: null, to: null, undated };

  const sorted = [...dates].sort();
  const from = sorted[0];
  const to = sorted[sorted.length - 1];
  const months = monthKeys(from, to).map((month) => ({
    month,
    count: dates.filter((d) => d.startsWith(month)).length,
  }));
  return { months, from, to, undated };
}

export interface WorkloadRow {
  key: string;
  label: string;
  open: number;
  overdue: number;
}

function workloadRow(
  key: string,
  label: string,
  cases: readonly Case[],
  asOf: ISODate,
): WorkloadRow {
  return { key, label, open: cases.length, overdue: dueCounts(cases, asOf).overdue };
}

export function teamWorkload(
  open: readonly Case[],
  teamLabels: Record<Team, string>,
  asOf: ISODate,
): WorkloadRow[] {
  return TEAMS.map((team) =>
    workloadRow(
      team,
      teamLabels[team],
      open.filter((c) => c.owner === team),
      asOf,
    ),
  );
}

/** Open cases currently with Asset Management, by the asset manager of the case's property. */
export function assetManagerWorkload(
  open: readonly Case[],
  propertyById: ReadonlyMap<string, Property>,
  personById: ReadonlyMap<string, Person>,
  asOf: ISODate,
): WorkloadRow[] {
  const groups = new Map<string, { label: string; cases: Case[] }>();
  for (const c of open.filter((o) => o.owner === 'asset_management')) {
    const managerId = c.propertyId === null ? null : propertyById.get(c.propertyId)?.assetManagerId;
    const person = managerId ? personById.get(managerId) : undefined;
    const key = person?.id ?? 'unassigned';
    const group = groups.get(key) ?? { label: person?.name ?? 'No asset manager', cases: [] };
    group.cases.push(c);
    groups.set(key, group);
  }
  return [...groups]
    .map(([key, g]) => workloadRow(key, g.label, g.cases, asOf))
    .sort((a, b) => b.open - a.open || compareLabels(a, b));
}

export interface ArRow {
  key: string;
  label: string;
  /** Live lease balance, in cents. Credits count against the total. */
  ar: number;
  leases: number;
}

export interface OpenAr {
  total: number;
  byProperty: ArRow[];
  byFund: ArRow[];
}

/**
 * Live lease balance behind the open cases. A lease with two open cases counts once, and a case
 * with no lease has no balance to add.
 */
export function openCaseAr(
  open: readonly Case[],
  leaseById: ReadonlyMap<string, Lease>,
  propertyById: ReadonlyMap<string, Property>,
): OpenAr {
  const leases = new Map<string, Lease>();
  for (const c of open) {
    const lease = c.leaseId === null ? undefined : leaseById.get(c.leaseId);
    if (lease) leases.set(lease.id, lease);
  }

  const group = (keyOf: (p: Property | undefined) => { key: string; label: string }): ArRow[] => {
    const rows = new Map<string, ArRow>();
    for (const lease of leases.values()) {
      const { key, label } = keyOf(
        lease.propertyId === null ? undefined : propertyById.get(lease.propertyId),
      );
      const row = rows.get(key) ?? { key, label, ar: 0, leases: 0 };
      row.ar += lease.arBalance ?? 0;
      row.leases += 1;
      rows.set(key, row);
    }
    return [...rows.values()].sort((a, b) => b.ar - a.ar || compareLabels(a, b));
  };

  return {
    total: [...leases.values()].reduce((sum, l) => sum + (l.arBalance ?? 0), 0),
    byProperty: group((p) => ({ key: p?.id ?? 'unknown', label: p?.name ?? 'Unknown property' })),
    byFund: group((p) => ({ key: p?.fund ?? 'unknown', label: p?.fund ?? 'Unknown fund' })),
  };
}

export interface CureRate {
  cured: number;
  closed: number;
  resolved: number;
  /** Cured over cured plus closed; null until something is resolved. */
  rate: number | null;
}

export function cureRate(cases: readonly Case[]): CureRate {
  const cured = cases.filter((c) => c.stage === 'cured').length;
  const closed = cases.filter((c) => c.stage === 'closed').length;
  const resolved = cured + closed;
  return { cured, closed, resolved, rate: resolved === 0 ? null : cured / resolved };
}

export interface WeekActivity {
  /** The Monday that starts the week. */
  week: ISODate;
  notes: number;
  stageChanges: number;
  ownerChanges: number;
}

export interface ActivityTimeline {
  weeks: WeekActivity[];
  total: number;
}

const emptyWeek = (week: ISODate): WeekActivity => ({
  week,
  notes: 0,
  stageChanges: 0,
  ownerChanges: 0,
});

/**
 * Work people did in the app, by the week they happened (the event's effective date, as the weekly summary uses). Imported notes and notification
 * events are not counted: they are not work done here.
 */
export function weeklyActivity(events: Iterable<CaseEvent>): ActivityTimeline {
  const byWeek = new Map<ISODate, WeekActivity>();
  let total = 0;
  for (const e of events) {
    if (e.type !== 'note' && e.type !== 'stage_changed' && e.type !== 'owner_changed') continue;
    const week = format(startOfISOWeek(parseISO(e.effectiveDate)), 'yyyy-MM-dd');
    const row = byWeek.get(week) ?? emptyWeek(week);
    if (e.type === 'note') row.notes += 1;
    else if (e.type === 'stage_changed') row.stageChanges += 1;
    else row.ownerChanges += 1;
    byWeek.set(week, row);
    total += 1;
  }
  if (total === 0) return { weeks: [], total };

  const keys = [...byWeek.keys()].sort();
  const last = keys[keys.length - 1];
  const weeks: WeekActivity[] = [];
  for (let w = parseISO(keys[0]); format(w, 'yyyy-MM-dd') <= last; w = addWeeks(w, 1)) {
    const week = format(w, 'yyyy-MM-dd');
    weeks.push(byWeek.get(week) ?? emptyWeek(week));
  }
  return { weeks, total };
}
