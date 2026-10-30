import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPersonas } from '@/lib/persona/personas';
import { readSeedDir } from '@/lib/seed';
import type { Seed } from '../schemas';
import type { CaseEvent, Persona } from '../types';
import { buildAnalytics } from './index';

const asOf = '2026-10-13';
const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));

let seed: Seed;
let personas: Persona[];

beforeAll(async () => {
  seed = await readSeedDir(path.join(process.cwd(), 'data', 'seed'));
  personas = buildPersonas(seed);
});

function analyticsFor(personaId: string, extraEvents: CaseEvent[] = []) {
  const eventsByCase = new Map<string, CaseEvent[]>();
  for (const e of [...seed.events, ...extraEvents]) {
    eventsByCase.set(e.caseId, [...(eventsByCase.get(e.caseId) ?? []), e]);
  }
  return buildAnalytics({
    persona: personas.find((p) => p.id === personaId)!,
    asOf,
    cases: seed.cases,
    eventsByCase,
    leaseById: byId(seed.leases),
    propertyById: byId(seed.properties),
    personById: byId(seed.people),
    tenantById: byId(seed.tenants),
    teamLabels: { legal: 'Legal', asset_management: 'Asset Mgmt' },
  });
}

describe('real seed at the data date, for Legal', () => {
  it('matches the headline numbers', () => {
    const a = analyticsFor('maya');
    expect(a.caseCount).toBe(37);
    expect(a.openCount).toBe(30);
    expect(a.stages.map((s) => s.count)).toEqual([5, 14, 7, 4]);
    expect(a.due).toEqual({ overdue: 8, dueThisWeek: 4 });
    expect(a.cure).toMatchObject({ cured: 4, closed: 3, resolved: 7 });
    expect(a.cure.rate).toBeCloseTo(4 / 7);
    expect(a.sent).toMatchObject({ from: '2026-02-12', to: '2026-10-12', undated: 5 });
    expect(a.sent.months.map((m) => m.count)).toEqual([2, 1, 2, 4, 4, 1, 3, 11, 4]);
    expect(a.teams.map((t) => [t.open, t.overdue])).toEqual([
      [21, 5],
      [9, 3],
    ]);
    expect(a.managers.map((m) => [m.label, m.open, m.overdue])).toEqual([
      ['Lena Brooks', 4, 2],
      ['Tom Reyes', 3, 1],
      ['Grace Lin', 2, 0],
    ]);
    expect(a.ar.total).toBe(59953509);
    expect(a.ar.byFund.map((f) => [f.label, f.ar])).toEqual([
      ['Income REIT', 35995413],
      ['Fund II', 23958096],
    ]);
    expect(a.ar.byProperty).toHaveLength(18);
    expect(a.ar.byProperty[0]).toMatchObject({ label: 'Copper Creek Commons', ar: 14177966 });
    expect(a.repeat.total).toBeGreaterThan(0);
  });

  it('has no app activity until someone works in the app', () => {
    expect(analyticsFor('maya').activity).toEqual({ weeks: [], total: 0 });
  });

  it('counts app events for cases in scope only', () => {
    const lena = analyticsFor('am-lena-brooks');
    const inScope = seed.cases.find((c) => c.propertyId === 'P-006')!;
    const outOfScope = seed.cases.find((c) => c.propertyId === 'P-004')!;
    const note = (caseId: string): CaseEvent => ({
      id: `E-${caseId}`,
      caseId,
      at: '2026-10-14T09:00:00.000Z',
      effectiveDate: '2026-10-14',
      actorPersonaId: 'maya',
      type: 'note',
      payload: {},
    });
    expect(lena.activity.total).toBe(0);
    expect(
      analyticsFor('am-lena-brooks', [note(inScope.id), note(outOfScope.id)]).activity.total,
    ).toBe(1);
    expect(analyticsFor('maya', [note(inScope.id), note(outOfScope.id)]).activity.total).toBe(2);
  });
});

describe('persona scope', () => {
  it('gives an asset manager only their slice', () => {
    const a = analyticsFor('am-lena-brooks');
    expect(a.caseCount).toBe(12);
    expect(a.openCount).toBe(11);
    expect(a.ar.total).toBe(16761792);
    expect(a.managers.map((m) => m.label)).toEqual(['Lena Brooks']);
    expect(a.cure).toMatchObject({ cured: 0, closed: 1, rate: 0 });
  });

  it('shows the Founder everything', () => {
    expect(analyticsFor('founder').openCount).toBe(30);
  });

  it('falls back to the tenant id when a tenant is unknown', () => {
    const a = buildAnalytics({
      persona: personas.find((p) => p.id === 'maya')!,
      asOf,
      cases: seed.cases.slice(0, 1),
      eventsByCase: new Map(),
      leaseById: new Map(),
      propertyById: new Map(),
      personById: new Map(),
      tenantById: new Map(),
      teamLabels: { legal: 'Legal', asset_management: 'Asset Mgmt' },
    });
    expect(a.tenantsByCases.rows[0].name).toBe(seed.cases[0].tenantId);
  });
});
