import { addDaysISO } from '@/domain/dates';
import { caseDeadline } from '@/domain/deadline';
import { casesInScope, openCases, sortByUrgency } from '@/domain/selectors';
import { compareEvents } from '@/domain/stage';
import type {
  Case,
  CaseEvent,
  Cents,
  ISODate,
  Lease,
  Person,
  Persona,
  Property,
  Tenant,
} from '@/domain/types';
import { weekdayDate } from '@/lib/format';
import type {
  AssetManagerGroup,
  MoneyLine,
  NewCase,
  StageChange,
  SummaryCase,
  WeekSummary,
} from './types';

/** The window is the as-of date and the six days before it. */
export const SUMMARY_DAYS = 7;

/** Reference data the summary reads; `Lookups` from the store satisfies it. */
export interface SummaryRefs {
  propertyById: ReadonlyMap<string, Property>;
  leaseById: ReadonlyMap<string, Lease>;
  tenantById: ReadonlyMap<string, Tenant>;
  personById: ReadonlyMap<string, Person>;
}

export interface SummaryInput {
  persona: Persona;
  asOf: ISODate;
  /** Current state of every case; scoping to the persona happens here. */
  cases: readonly Case[];
  events: readonly CaseEvent[];
  refs: SummaryRefs;
  /** Persona id to display name, for stage-change actors. */
  actorNames: Readonly<Record<string, string>>;
}

export const subjectLine = (asOf: ISODate) =>
  `Notice Desk weekly summary, week ending ${weekdayDate(asOf)}`;

function assetManagerOf(c: Case, refs: SummaryRefs): string | null {
  const property = c.propertyId === null ? undefined : refs.propertyById.get(c.propertyId);
  const managerId = property?.assetManagerId ?? null;
  return managerId === null ? null : (refs.personById.get(managerId)?.name ?? null);
}

function toSummaryCase(c: Case, asOf: ISODate, refs: SummaryRefs): SummaryCase {
  const lease = c.leaseId === null ? undefined : refs.leaseById.get(c.leaseId);
  const { deadline, status, daysUntil } = caseDeadline(c, asOf);
  const dated = status !== 'none';
  return {
    caseId: c.id,
    tenant: refs.tenantById.get(c.tenantId)?.displayName ?? 'Unknown tenant',
    property: c.propertyId === null ? null : (refs.propertyById.get(c.propertyId)?.name ?? null),
    suite: lease?.suite ?? null,
    stage: c.stage,
    issueType: c.issueType,
    owner: c.owner,
    ownerName: c.owner === 'legal' ? 'Legal' : (assetManagerOf(c, refs) ?? 'Asset management'),
    deadline: dated ? deadline : null,
    daysUntilDeadline: dated ? daysUntil : null,
    deadlineStatus: status,
    arCents: lease?.arBalance ?? null,
  };
}

function groupByAssetManager(
  cases: readonly Case[],
  asOf: ISODate,
  refs: SummaryRefs,
): AssetManagerGroup[] {
  const groups = new Map<string | null, SummaryCase[]>();
  for (const c of sortByUrgency(cases, asOf)) {
    const person = assetManagerOf(c, refs);
    groups.set(person, [...(groups.get(person) ?? []), toSummaryCase(c, asOf, refs)]);
  }
  const named = [...groups.keys()]
    .filter((k): k is string => k !== null)
    .sort((a, b) => a.localeCompare(b));
  const order = groups.has(null) ? [...named, null] : named;
  return order.map((person) => {
    const list = groups.get(person)!;
    return {
      person,
      cases: list,
      overdue: list.filter((c) => c.deadlineStatus === 'overdue').length,
    };
  });
}

function moneyLine(open: readonly Case[], refs: SummaryRefs): MoneyLine {
  const counted = new Set<string>();
  let liveArCents: Cents = 0;
  let casesWithoutBalance = 0;
  for (const c of open) {
    const lease = c.leaseId === null ? undefined : refs.leaseById.get(c.leaseId);
    const balance = lease?.arBalance ?? null;
    if (lease === undefined || balance === null) {
      casesWithoutBalance += 1;
    } else if (!counted.has(lease.id)) {
      counted.add(lease.id);
      liveArCents += balance;
    }
  }
  return { liveArCents, openCases: open.length, casesWithoutBalance, historyAvailable: false };
}

const byDateThenId = (a: { date: ISODate; caseId: string }, b: { date: ISODate; caseId: string }) =>
  a.date.localeCompare(b.date) || a.caseId.localeCompare(b.caseId);

export function buildWeekSummary(input: SummaryInput): WeekSummary {
  const { persona, asOf, refs, actorNames } = input;
  const weekStart = addDaysISO(asOf, 1 - SUMMARY_DAYS);
  const inWindow = (date: ISODate) => date >= weekStart && date <= asOf;

  const scoped = casesInScope(input.cases, persona);
  const scopedById = new Map(scoped.map((c) => [c.id, c]));
  const open = openCases(scoped);
  const summaryCase = (c: Case) => toSummaryCase(c, asOf, refs);

  const windowEvents = input.events
    .filter((e) => inWindow(e.effectiveDate) && scopedById.has(e.caseId))
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || compareEvents(a, b));

  const openedOn = new Map<string, ISODate>();
  for (const e of windowEvents) {
    if (e.type === 'case_opened' && !openedOn.has(e.caseId))
      openedOn.set(e.caseId, e.effectiveDate);
  }
  const newCases: NewCase[] = [];
  for (const c of scoped) {
    const date = c.dateSent !== null && inWindow(c.dateSent) ? c.dateSent : openedOn.get(c.id);
    if (date !== undefined) newCases.push({ ...summaryCase(c), date });
  }
  newCases.sort(byDateThenId);

  const stageChanges: StageChange[] = [];
  for (const e of windowEvents) {
    if (e.type !== 'stage_changed') continue;
    stageChanges.push({
      ...summaryCase(scopedById.get(e.caseId)!),
      date: e.effectiveDate,
      from: e.payload.from,
      to: e.payload.to,
      actor: actorNames[e.actorPersonaId] ?? 'Unknown',
    });
  }
  const curedOrClosed = stageChanges.filter((s) => s.to === 'cured' || s.to === 'closed');

  const urgent = sortByUrgency(open, asOf).map(summaryCase);
  const overdue = urgent.filter((c) => c.deadlineStatus === 'overdue');
  const dueSoon = urgent.filter((c) => c.deadlineStatus === 'due_this_week');
  const waitingOnLegal = urgent.filter((c) => c.owner === 'legal');
  const waitingOnAssetManagement = groupByAssetManager(
    open.filter((c) => c.owner === 'asset_management'),
    asOf,
    refs,
  );

  return {
    asOf,
    weekStart,
    subject: subjectLine(asOf),
    viewer: persona.label,
    scope: persona.scopePropertyIds === 'all' ? 'portfolio' : 'own_properties',
    counts: {
      inScope: scoped.length,
      open: open.length,
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      waitingOnLegal: waitingOnLegal.length,
      waitingOnAssetManagement: waitingOnAssetManagement.reduce((n, g) => n + g.cases.length, 0),
      newCases: newCases.length,
      stageChanges: stageChanges.length,
      curedOrClosed: curedOrClosed.length,
    },
    newCases,
    stageChanges,
    curedOrClosed,
    overdue,
    dueSoon,
    waitingOnAssetManagement,
    waitingOnLegal,
    money: moneyLine(open, refs),
  };
}
