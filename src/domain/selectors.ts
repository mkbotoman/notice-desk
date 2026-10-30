import { caseDeadline } from './deadline';
import { can } from './permissions';
import { isTerminal, waitingOn } from './stage';
import { STAGES, type Case, type ISODate, type Persona } from './types';

export function openCases(cases: readonly Case[]): Case[] {
  return cases.filter((c) => !isTerminal(c.stage));
}

export function casesInScope(cases: readonly Case[], persona: Persona): Case[] {
  return cases.filter((c) => can(persona, 'view_case', c));
}

export function casesByTenant(cases: readonly Case[]): Map<string, Case[]> {
  const byTenant = new Map<string, Case[]>();
  for (const c of cases) byTenant.set(c.tenantId, [...(byTenant.get(c.tenantId) ?? []), c]);
  return byTenant;
}

/** Open cases in the persona's scope that are in the persona's team's court. */
export function waitingOnPersona(cases: readonly Case[], persona: Persona): Case[] {
  if (persona.team === null) return [];
  return casesInScope(openCases(cases), persona).filter((c) => waitingOn(c) === persona.team);
}

/** Dated cases sort after undated ones, and ties fall back to the case id. */
const byDate = (a: ISODate | null, b: ISODate | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b);

/**
 * Most urgent first. Live deadlines in date order, then notices whose deadline can't be read
 * (they need attention too), then everything else by stage and date.
 */
export function sortByUrgency(cases: readonly Case[], asOf: ISODate): Case[] {
  const keyed = cases.map((c) => {
    const { deadline, status } = caseDeadline(c, asOf);
    const group = status === 'missing' ? 1 : status === 'none' ? 2 : 0;
    return { c, deadline, group };
  });
  keyed.sort(
    (a, b) =>
      a.group - b.group ||
      (a.group === 2 ? STAGES.indexOf(a.c.stage) - STAGES.indexOf(b.c.stage) : 0) ||
      (a.group === 1 ? byDate(a.c.dateSent, b.c.dateSent) : byDate(a.deadline, b.deadline)) ||
      a.c.id.localeCompare(b.c.id),
  );
  return keyed.map((k) => k.c);
}
