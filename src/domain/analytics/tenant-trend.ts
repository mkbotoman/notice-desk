import { daysBetween } from '../dates';
import { inScope } from '../permissions';
import { casesInScope } from '../selectors';
import { isTerminal } from '../stage';
import type {
  ArAging,
  Case,
  CaseEvent,
  Cents,
  ISODate,
  Lease,
  Persona,
  Property,
  Stage,
  Tenant,
} from '../types';
import { sentTimeline, weeklyActivity, type ActivityTimeline, type SentTimeline } from './team';

export interface TenantLeaseBalance {
  leaseId: string;
  /** "Harbor Commons · Ste 104". */
  label: string;
  balance: Cents;
  aging: ArAging;
}

export interface TenantCaseAge {
  caseId: string;
  stage: Stage;
  open: boolean;
  dateSent: ISODate | null;
  /** Days from the notice to the as-of date, or null when no notice was sent. */
  daysSinceSent: number | null;
}

/** One tenant's story over time, for what the persona is allowed to see. */
export interface TenantTrend {
  caseCount: number;
  openCount: number;
  resolvedCount: number;
  /** Live balance across the tenant's leases in view. */
  totalAr: Cents;
  sent: SentTimeline;
  /** Notes, stage changes and owner changes made in the app on this tenant's cases. */
  activity: ActivityTimeline;
  leases: TenantLeaseBalance[];
  cases: TenantCaseAge[];
}

export interface TenantTrendInput {
  tenantId: string;
  persona: Persona;
  asOf: ISODate;
  cases: readonly Case[];
  eventsByCase: ReadonlyMap<string, readonly CaseEvent[]>;
  leases: Iterable<Lease>;
  propertyById: ReadonlyMap<string, Property>;
}

export function buildTenantTrend(input: TenantTrendInput): TenantTrend {
  const { tenantId, persona, asOf, eventsByCase, propertyById } = input;
  const mine = casesInScope(input.cases, persona).filter((c) => c.tenantId === tenantId);
  const open = mine.filter((c) => !isTerminal(c.stage));

  const leases: TenantLeaseBalance[] = [...input.leases]
    .filter((l) => l.tenantId === tenantId && inScope(persona, l.propertyId))
    .map((l) => ({
      leaseId: l.id,
      label: [
        (l.propertyId && propertyById.get(l.propertyId)?.name) || 'Unknown property',
        l.suite ? `Ste ${l.suite}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      balance: l.arBalance ?? 0,
      aging: l.arAgingRecorded,
    }))
    .sort((a, b) => b.balance - a.balance || a.leaseId.localeCompare(b.leaseId));

  const cases: TenantCaseAge[] = mine
    .map((c) => ({
      caseId: c.id,
      stage: c.stage,
      open: !isTerminal(c.stage),
      dateSent: c.dateSent,
      daysSinceSent: c.dateSent === null ? null : daysBetween(c.dateSent, asOf),
    }))
    .sort(
      (a, b) =>
        (a.dateSent ?? '9999').localeCompare(b.dateSent ?? '9999') ||
        a.caseId.localeCompare(b.caseId),
    );

  return {
    caseCount: mine.length,
    openCount: open.length,
    resolvedCount: mine.length - open.length,
    totalAr: leases.reduce((sum, l) => sum + l.balance, 0),
    sent: sentTimeline(mine, eventsByCase),
    activity: weeklyActivity(mine.flatMap((c) => eventsByCase.get(c.id) ?? [])),
    leases,
    cases,
  };
}

export interface TenantChoice {
  id: string;
  name: string;
  cases: number;
}

/** Tenants with at least one case the persona may see: most cases first, then by name. */
export function tenantChoices(
  cases: readonly Case[],
  persona: Persona,
  tenantById: ReadonlyMap<string, Tenant>,
): TenantChoice[] {
  const counts = new Map<string, number>();
  for (const c of casesInScope(cases, persona)) {
    counts.set(c.tenantId, (counts.get(c.tenantId) ?? 0) + 1);
  }
  return [...counts]
    .map(([id, n]) => ({ id, name: tenantById.get(id)?.displayName ?? 'Unknown tenant', cases: n }))
    .sort((a, b) => b.cases - a.cases || a.name.localeCompare(b.name));
}
