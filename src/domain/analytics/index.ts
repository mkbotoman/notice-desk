import { inScope } from '../permissions';
import { casesInScope, openCases } from '../selectors';
import type {
  Case,
  CaseEvent,
  ISODate,
  Lease,
  Persona,
  Person,
  Property,
  Team,
  Tenant,
} from '../types';
import {
  assetManagerWorkload,
  cureRate,
  dueCounts,
  openCaseAr,
  sentTimeline,
  stageCounts,
  teamWorkload,
  weeklyActivity,
} from './team';
import { repeatTenants, topTenantsByAr, topTenantsByCases } from './tenants';

export * from './team';
export * from './tenants';

export const TOP_N = 10;

export interface AnalyticsInput {
  persona: Persona;
  asOf: ISODate;
  cases: readonly Case[];
  eventsByCase: ReadonlyMap<string, readonly CaseEvent[]>;
  leaseById: ReadonlyMap<string, Lease>;
  propertyById: ReadonlyMap<string, Property>;
  personById: ReadonlyMap<string, Person>;
  tenantById: ReadonlyMap<string, Tenant>;
  teamLabels: Record<Team, string>;
}

/** Everything the analytics page draws, already limited to what the persona may see. */
export function buildAnalytics(input: AnalyticsInput) {
  const { persona, asOf, eventsByCase, leaseById, propertyById, personById, tenantById } = input;
  const cases = casesInScope(input.cases, persona);
  const open = openCases(cases);
  const leases = [...leaseById.values()].filter((l) => inScope(persona, l.propertyId));
  const nameOf = (id: string) => tenantById.get(id)?.displayName ?? id;
  const caseIds = new Set(cases.map((c) => c.id));
  const events = [...eventsByCase].filter(([id]) => caseIds.has(id)).flatMap(([, list]) => list);

  return {
    caseCount: cases.length,
    openCount: open.length,
    stages: stageCounts(open),
    due: dueCounts(open, asOf),
    sent: sentTimeline(cases, eventsByCase),
    teams: teamWorkload(open, input.teamLabels, asOf),
    managers: assetManagerWorkload(open, propertyById, personById, asOf),
    ar: openCaseAr(open, leaseById, propertyById),
    cure: cureRate(cases),
    activity: weeklyActivity(events),
    tenantsByCases: topTenantsByCases(cases, nameOf, TOP_N),
    tenantsByAr: topTenantsByAr(leases, nameOf, TOP_N),
    repeat: repeatTenants(cases, leases, nameOf, TOP_N),
  };
}

export type Analytics = ReturnType<typeof buildAnalytics>;
