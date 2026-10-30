import { describe, expect, it } from 'vitest';
import { makeCase, makeEvent } from '@/test/factories';
import type { Lease, Persona, Property, Tenant } from '../types';
import { buildTenantTrend, tenantChoices } from './tenant-trend';

const persona = (over: Partial<Persona> = {}): Persona => ({
  id: 'maya',
  label: 'Maya',
  kind: 'legal',
  personId: null,
  team: 'legal',
  scopePropertyIds: 'all',
  ...over,
});
const lease = (over: Partial<Lease> = {}): Lease => ({
  id: 'L-1',
  propertyId: 'P-1',
  tenantId: 'T-1',
  suite: '104',
  sqFt: null,
  status: 'active',
  startDate: null,
  endDate: null,
  monthlyRent: 100000,
  arBalance: 250000,
  arAgingRecorded: '31_60',
  arAgingImplied: null,
  watchlistReasons: [],
  ...over,
});
const property = (id: string, name: string): Property => ({
  id,
  name,
  aliases: [],
  type: 'retail',
  city: 'X',
  state: 'CA',
  market: 'X',
  fund: 'F',
  assetManagerId: null,
  propertyManagerId: null,
  sqFt: null,
  acquiredDate: null,
});
const propertyById = new Map([
  ['P-1', property('P-1', 'Harbor Commons')],
  ['P-2', property('P-2', 'Seaside')],
]);
const asOf = '2026-10-13';

const cases = [
  makeCase({
    id: 'N-2',
    tenantId: 'T-1',
    propertyId: 'P-1',
    stage: 'cured',
    dateSent: '2026-08-01',
  }),
  makeCase({
    id: 'N-1',
    tenantId: 'T-1',
    propertyId: 'P-1',
    stage: 'notice_to_cure',
    dateSent: '2026-09-28',
  }),
  makeCase({
    id: 'N-3',
    tenantId: 'T-1',
    propertyId: 'P-2',
    stage: 'non_compliant',
    dateSent: null,
  }),
  makeCase({ id: 'N-9', tenantId: 'T-2', propertyId: 'P-1' }),
];
const events = new Map([
  ['N-1', [makeEvent({ caseId: 'N-1', effectiveDate: '2026-10-05' })]],
  ['N-9', [makeEvent({ caseId: 'N-9', effectiveDate: '2026-10-06' })]],
]);
const run = (over: Partial<Parameters<typeof buildTenantTrend>[0]> = {}) =>
  buildTenantTrend({
    tenantId: 'T-1',
    persona: persona(),
    asOf,
    cases,
    eventsByCase: events,
    leases: [
      lease(),
      lease({
        id: 'L-2',
        propertyId: 'P-2',
        suite: null,
        arBalance: 900000,
        arAgingRecorded: '90_plus',
      }),
      lease({ id: 'L-3', tenantId: 'T-2' }),
    ],
    propertyById,
    ...over,
  });

describe('buildTenantTrend', () => {
  it('counts the tenant’s cases, open and resolved, and ignores other tenants', () => {
    const t = run();
    expect([t.caseCount, t.openCount, t.resolvedCount]).toEqual([3, 2, 1]);
  });

  it('puts the notices on a month timeline and counts only this tenant’s activity', () => {
    const t = run();
    expect(t.sent.months).toEqual([
      { month: '2026-08', count: 1 },
      { month: '2026-09', count: 1 },
    ]);
    expect(t.sent.undated).toBe(1);
    expect(t.activity.total).toBe(1);
  });

  it('lists each lease’s live balance, biggest first, with a readable label', () => {
    const t = run();
    expect(t.leases.map((l) => [l.leaseId, l.label, l.balance])).toEqual([
      ['L-2', 'Seaside', 900000],
      ['L-1', 'Harbor Commons · Ste 104', 250000],
    ]);
    expect(t.totalAr).toBe(1150000);
  });

  it('treats a missing balance as zero and a missing property as unknown', () => {
    const t = run({ leases: [lease({ arBalance: null, propertyId: null })] });
    expect(t.leases).toEqual([
      { leaseId: 'L-1', label: 'Unknown property · Ste 104', balance: 0, aging: '31_60' },
    ]);
    const unnamed = run({ leases: [lease({ propertyId: 'P-404' })] });
    expect(unnamed.leases[0].label.startsWith('Unknown property')).toBe(true);
  });

  it('shows how long ago each notice went out, oldest first, with unsent cases last', () => {
    const t = run();
    expect(t.cases.map((c) => [c.caseId, c.daysSinceSent, c.open])).toEqual([
      ['N-2', 73, false],
      ['N-1', 15, true],
      ['N-3', null, true],
    ]);
  });

  it('breaks date ties by case id', () => {
    const tied = [
      makeCase({ id: 'B', tenantId: 'T-1', dateSent: '2026-09-01' }),
      makeCase({ id: 'A', tenantId: 'T-1', dateSent: '2026-09-01' }),
    ];
    expect(run({ cases: tied }).cases.map((c) => c.caseId)).toEqual(['A', 'B']);
  });

  it('breaks balance ties by lease id, and orders unsent cases by id', () => {
    const t = run({
      leases: [lease({ id: 'L-B', arBalance: 100 }), lease({ id: 'L-A', arBalance: 100 })],
      cases: [
        makeCase({ id: 'Z', tenantId: 'T-1', dateSent: null }),
        makeCase({ id: 'Y', tenantId: 'T-1', dateSent: null }),
        makeCase({ id: 'X', tenantId: 'T-1', dateSent: '2026-09-01' }),
      ],
    });
    expect(t.leases.map((l) => l.leaseId)).toEqual(['L-A', 'L-B']);
    expect(t.cases.map((c) => c.caseId)).toEqual(['X', 'Y', 'Z']);
  });

  it('shows a scoped persona only their properties', () => {
    const lena = persona({ id: 'lena', kind: 'asset_manager', scopePropertyIds: ['P-2'] });
    const t = run({ persona: lena });
    expect(t.cases.map((c) => c.caseId)).toEqual(['N-3']);
    expect(t.leases.map((l) => l.leaseId)).toEqual(['L-2']);
  });

  it('is empty for a tenant with nothing in view', () => {
    const t = run({ tenantId: 'T-404' });
    expect([t.caseCount, t.totalAr, t.leases.length, t.cases.length]).toEqual([0, 0, 0, 0]);
    expect(t.sent.months).toEqual([]);
  });
});

describe('tenantChoices', () => {
  const tenantById = new Map<string, Tenant>([
    ['T-1', { id: 'T-1', displayName: 'Brightside', nameVariants: [] }],
  ]);

  it('lists tenants with a case in view, most cases first, then by name', () => {
    const more = [...cases, makeCase({ id: 'N-5', tenantId: 'T-3' })];
    expect(tenantChoices(more, persona(), tenantById)).toEqual([
      { id: 'T-1', name: 'Brightside', cases: 3 },
      { id: 'T-2', name: 'Unknown tenant', cases: 1 },
      { id: 'T-3', name: 'Unknown tenant', cases: 1 },
    ]);
  });

  it('limits a scoped persona to their properties', () => {
    const lena = persona({ kind: 'asset_manager', scopePropertyIds: ['P-2'] });
    expect(tenantChoices(cases, lena, tenantById)).toEqual([
      { id: 'T-1', name: 'Brightside', cases: 1 },
    ]);
  });
});
