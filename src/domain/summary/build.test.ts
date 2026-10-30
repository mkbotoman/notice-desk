import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Case, CaseEvent, Lease, Persona, Property } from '@/domain/types';
import { buildPersonas } from '@/lib/persona/personas';
import { readSeedDir } from '@/lib/seed';
import { buildLookups } from '@/store/lookups';
import { buildWeekSummary, subjectLine, type SummaryInput, type SummaryRefs } from './build';

const ASOF = '2026-10-13';
const START = '2026-10-07';

const kase = (over: Partial<Case> = {}): Case => ({
  id: 'N-1',
  leaseId: 'L-1',
  tenantId: 'T-1',
  propertyId: 'P-1',
  stage: 'notice_to_cure',
  issueType: 'monetary',
  dateSent: '2026-09-01',
  curePeriod: { kind: 'days', n: 10, unit: 'calendar' },
  owner: 'legal',
  amountOwedAtNotice: null,
  legalFeesTerms: null,
  lenderNotice: null,
  workflowStatus: null,
  courtCaseNo: null,
  guarantorName: null,
  hasGuarantor: false,
  ...over,
});

const lease = (over: Partial<Lease> = {}): Lease => ({
  id: 'L-1',
  propertyId: 'P-1',
  tenantId: 'T-1',
  suite: '100',
  sqFt: null,
  status: 'active',
  startDate: null,
  endDate: null,
  monthlyRent: null,
  arBalance: 100000,
  arAgingRecorded: 'current',
  arAgingImplied: null,
  watchlistReasons: [],
  ...over,
});

const property = (id: string, over: Partial<Property> = {}): Property => ({
  id,
  name: `Property ${id}`,
  aliases: [],
  type: 'retail',
  city: 'X',
  state: 'CA',
  market: 'X',
  fund: 'F',
  assetManagerId: 'PER-a',
  propertyManagerId: null,
  sqFt: null,
  acquiredDate: null,
  ...over,
});

const refs = (over: Partial<SummaryRefs> = {}): SummaryRefs => ({
  propertyById: new Map([
    ['P-1', property('P-1')],
    ['P-2', property('P-2', { assetManagerId: 'PER-b' })],
    ['P-3', property('P-3', { assetManagerId: null })],
    ['P-4', property('P-4', { assetManagerId: 'PER-ghost' })],
  ]),
  leaseById: new Map([['L-1', lease()]]),
  tenantById: new Map([['T-1', { id: 'T-1', displayName: 'Acme LLC', nameVariants: [] }]]),
  personById: new Map([
    ['PER-a', { id: 'PER-a', name: 'Ann Adams', roles: ['asset_manager'] }],
    ['PER-b', { id: 'PER-b', name: 'Bo Bell', roles: ['asset_manager'] }],
  ]),
  ...over,
});

const legal: Persona = {
  id: 'maya',
  label: 'Maya',
  kind: 'legal',
  personId: null,
  team: 'legal',
  scopePropertyIds: 'all',
};
const ann: Persona = {
  id: 'am-a',
  label: 'Ann Adams',
  kind: 'asset_manager',
  personId: 'PER-a',
  team: 'asset_management',
  scopePropertyIds: ['P-1'],
};

const event = (over: Partial<CaseEvent> & { type: CaseEvent['type'] }): CaseEvent =>
  ({
    id: 'E-1',
    caseId: 'N-1',
    at: '2026-10-10T09:00:00.000Z',
    effectiveDate: '2026-10-10',
    actorPersonaId: 'maya',
    payload: {},
    ...over,
  }) as CaseEvent;

const stageEvent = (over: Partial<CaseEvent> = {}): CaseEvent =>
  event({ type: 'stage_changed', payload: { from: 'notice_to_cure', to: 'default' }, ...over });

const build = (over: Partial<SummaryInput> = {}) =>
  buildWeekSummary({
    persona: legal,
    asOf: ASOF,
    cases: [],
    events: [],
    refs: refs(),
    actorNames: { maya: 'Maya' },
    ...over,
  });

describe('window and new cases', () => {
  it('runs seven days ending on the as-of date, both ends inclusive', () => {
    const s = build();
    expect(s.weekStart).toBe(START);
    expect(s.asOf).toBe(ASOF);
    expect(s.subject).toBe('Notice Desk weekly summary, week ending Tue, Oct 13');
    expect(subjectLine('2026-10-13')).toBe(s.subject);
  });

  it('counts notices sent on the first and last day, not a day outside', () => {
    const s = build({
      cases: [
        kase({ id: 'A-before', dateSent: '2026-10-06' }),
        kase({ id: 'B-first', dateSent: START }),
        kase({ id: 'C-last', dateSent: ASOF }),
        kase({ id: 'D-after', dateSent: '2026-10-14' }),
        kase({ id: 'E-undated', dateSent: null }),
      ],
    });
    expect(s.newCases.map((c) => [c.caseId, c.date])).toEqual([
      ['B-first', START],
      ['C-last', ASOF],
    ]);
    expect(s.counts.newCases).toBe(2);
  });

  it('adds cases opened in the app, once, and sorts by date then id', () => {
    const s = build({
      cases: [
        kase({ id: 'N-b', dateSent: '2026-10-10' }),
        kase({ id: 'N-a', dateSent: '2026-10-10' }),
        kase({ id: 'N-new', dateSent: null }),
        kase({ id: 'N-old', dateSent: '2026-01-05' }),
        kase({ id: 'N-both', dateSent: '2026-10-08' }),
      ],
      events: [
        event({ type: 'case_opened', id: 'E-1', caseId: 'N-new', effectiveDate: '2026-10-09' }),
        event({ type: 'case_opened', id: 'E-2', caseId: 'N-new', effectiveDate: '2026-10-11' }),
        event({ type: 'case_opened', id: 'E-3', caseId: 'N-old', effectiveDate: '2026-10-07' }),
        event({ type: 'case_opened', id: 'E-4', caseId: 'N-both', effectiveDate: '2026-10-13' }),
        event({ type: 'case_opened', id: 'E-5', caseId: 'N-x', effectiveDate: '2026-10-09' }),
      ],
    });
    expect(s.newCases.map((c) => [c.caseId, c.date])).toEqual([
      ['N-old', '2026-10-07'],
      ['N-both', '2026-10-08'],
      ['N-new', '2026-10-09'],
      ['N-a', '2026-10-10'],
      ['N-b', '2026-10-10'],
    ]);
  });
});

describe('stage changes', () => {
  const cases = [kase({ id: 'N-1' }), kase({ id: 'N-2', stage: 'default' })];

  it('includes events on the first and last day and excludes one day outside', () => {
    const s = build({
      cases,
      events: [
        stageEvent({ id: 'E-before', effectiveDate: '2026-10-06' }),
        stageEvent({ id: 'E-first', effectiveDate: START }),
        stageEvent({ id: 'E-last', effectiveDate: ASOF }),
        stageEvent({ id: 'E-after', effectiveDate: '2026-10-14' }),
      ],
    });
    expect(s.stageChanges.map((c) => c.date)).toEqual([START, ASOF]);
  });

  it('reports who, when, from and to, oldest first, and ignores other event types', () => {
    const s = build({
      cases,
      actorNames: { maya: 'Maya', 'am-a': 'Ann Adams' },
      events: [
        stageEvent({
          id: 'E-2',
          caseId: 'N-1',
          effectiveDate: '2026-10-12',
          actorPersonaId: 'am-a',
        }),
        stageEvent({
          id: 'E-1',
          caseId: 'N-2',
          effectiveDate: '2026-10-09',
          actorPersonaId: 'nobody',
          payload: { from: 'default', to: 'closed' },
        } as Partial<CaseEvent>),
        stageEvent({
          id: 'E-3',
          caseId: 'N-2',
          effectiveDate: '2026-10-09',
          at: '2026-10-09T08:00:00.000Z',
        }),
        event({ type: 'note', id: 'E-4', note: 'free text that must not appear' }),
        event({
          type: 'owner_changed',
          id: 'E-5',
          payload: { from: 'legal', to: 'asset_management' },
        }),
      ],
    });
    expect(s.stageChanges.map((c) => [c.date, c.caseId, c.from, c.to, c.actor])).toEqual([
      ['2026-10-09', 'N-2', 'notice_to_cure', 'default', 'Maya'],
      ['2026-10-09', 'N-2', 'default', 'closed', 'Unknown'],
      ['2026-10-12', 'N-1', 'notice_to_cure', 'default', 'Ann Adams'],
    ]);
    expect(s.curedOrClosed.map((c) => c.to)).toEqual(['closed']);
    expect(s.counts).toMatchObject({ stageChanges: 3, curedOrClosed: 1 });
    expect(JSON.stringify(s)).not.toContain('free text');
  });

  it('counts a move to cured as cured', () => {
    const s = build({
      cases,
      events: [
        stageEvent({ payload: { from: 'notice_to_cure', to: 'cured' } } as Partial<CaseEvent>),
      ],
    });
    expect(s.curedOrClosed.map((c) => c.to)).toEqual(['cured']);
  });
});

describe('scoping', () => {
  const cases = [
    kase({ id: 'N-1', propertyId: 'P-1', dateSent: '2026-10-10' }),
    kase({ id: 'N-2', propertyId: 'P-2', dateSent: '2026-10-10' }),
  ];
  const events = [stageEvent({ caseId: 'N-2' }), stageEvent({ id: 'E-2', caseId: 'N-1' })];

  it('gives Legal and the founder the whole portfolio', () => {
    const s = build({ cases, events });
    expect(s.scope).toBe('portfolio');
    expect(s.counts).toMatchObject({ inScope: 2, newCases: 2, stageChanges: 2 });
  });

  it('limits an asset manager to their own properties, events included', () => {
    const s = build({ persona: ann, cases, events });
    expect(s.scope).toBe('own_properties');
    expect(s.viewer).toBe('Ann Adams');
    expect(s.counts).toMatchObject({ inScope: 1, newCases: 1, stageChanges: 1 });
    expect(s.stageChanges.map((c) => c.caseId)).toEqual(['N-1']);
  });

  it('is empty, not broken, for a persona with nothing in scope', () => {
    const s = build({ persona: { ...ann, scopePropertyIds: [] }, cases, events });
    expect(s.counts.inScope).toBe(0);
    expect(s.money).toEqual({
      liveArCents: 0,
      openCases: 0,
      casesWithoutBalance: 0,
      historyAvailable: false,
    });
  });
});

describe('deadlines and waiting lists', () => {
  const cases = [
    kase({ id: 'N-late', dateSent: '2026-09-20' }),
    kase({ id: 'N-today', dateSent: '2026-10-03' }),
    kase({ id: 'N-edge', dateSent: '2026-10-10' }),
    kase({ id: 'N-far', dateSent: '2026-10-12' }),
    kase({ id: 'N-default', stage: 'default', dateSent: '2026-09-01' }),
    kase({ id: 'N-cured', stage: 'cured', dateSent: '2026-09-01' }),
  ];

  it('splits overdue from the next 7 days, today included', () => {
    const s = build({ cases });
    expect(s.overdue.map((c) => [c.caseId, c.deadline, c.daysUntilDeadline])).toEqual([
      ['N-late', '2026-09-30', -13],
    ]);
    expect(s.dueSoon.map((c) => [c.caseId, c.deadline, c.daysUntilDeadline])).toEqual([
      ['N-today', '2026-10-13', 0],
      ['N-edge', '2026-10-20', 7],
    ]);
    expect(s.counts).toMatchObject({ open: 5, overdue: 1, dueSoon: 2 });
  });

  it('carries no deadline for cases past Notice to Cure', () => {
    const c = build({ cases }).waitingOnLegal.find((x) => x.caseId === 'N-default')!;
    expect(c).toMatchObject({ deadline: null, daysUntilDeadline: null, deadlineStatus: 'none' });
  });

  it('keeps a case whose cure period cannot be read in the waiting list only', () => {
    const s = build({ cases: [kase({ curePeriod: { kind: 'unknown' } })] });
    expect(s.overdue).toEqual([]);
    expect(s.dueSoon).toEqual([]);
    expect(s.waitingOnLegal[0]).toMatchObject({ deadline: null, deadlineStatus: 'missing' });
  });

  it('groups asset management cases by person, unassigned last', () => {
    const am = (id: string, propertyId: string | null, over: Partial<Case> = {}) =>
      kase({ id, propertyId, owner: 'asset_management', dateSent: '2026-10-10', ...over });
    const s = build({
      cases: [
        am('N-p3', 'P-3'),
        am('N-b', 'P-2'),
        am('N-a2', 'P-1', { dateSent: '2026-09-01' }),
        am('N-a1', 'P-1'),
        am('N-ghost', 'P-4'),
        am('N-nop', null),
        am('N-done', 'P-1', { stage: 'closed' }),
        kase({ id: 'N-legal', propertyId: 'P-1' }),
      ],
    });
    expect(
      s.waitingOnAssetManagement.map((g) => [g.person, g.cases.map((c) => c.caseId), g.overdue]),
    ).toEqual([
      ['Ann Adams', ['N-a2', 'N-a1'], 1],
      ['Bo Bell', ['N-b'], 0],
      [null, ['N-ghost', 'N-nop', 'N-p3'], 0],
    ]);
    expect(s.counts).toMatchObject({ waitingOnAssetManagement: 6, waitingOnLegal: 1 });
  });

  it('names the owner: Legal, the asset manager, or a fallback', () => {
    const s = build({
      cases: [
        kase({ id: 'N-l' }),
        kase({ id: 'N-a', owner: 'asset_management' }),
        kase({ id: 'N-n', owner: 'asset_management', propertyId: 'P-3' }),
      ],
    });
    const owner = (id: string) =>
      [...s.waitingOnLegal, ...s.waitingOnAssetManagement.flatMap((g) => g.cases)].find(
        (c) => c.caseId === id,
      )!.ownerName;
    expect([owner('N-l'), owner('N-a'), owner('N-n')]).toEqual([
      'Legal',
      'Ann Adams',
      'Asset management',
    ]);
  });
});

describe('case details', () => {
  it('falls back when a tenant, property or lease cannot be found', () => {
    const detail = (over: Partial<Case>) => build({ cases: [kase(over)] }).waitingOnLegal[0];
    expect(detail({})).toMatchObject({
      tenant: 'Acme LLC',
      property: 'Property P-1',
      suite: '100',
      arCents: 100000,
    });
    expect(detail({ tenantId: 'T-x' }).tenant).toBe('Unknown tenant');
    expect(detail({ propertyId: null }).property).toBeNull();
    expect(detail({ propertyId: 'P-x' }).property).toBeNull();
    expect(detail({ leaseId: null })).toMatchObject({ suite: null, arCents: null });
    expect(detail({ leaseId: 'L-x' })).toMatchObject({ suite: null, arCents: null });
  });
});

describe('money line', () => {
  it('counts a shared lease once, nets credits, and flags cases with no balance', () => {
    const s = build({
      refs: refs({
        leaseById: new Map([
          ['L-1', lease()],
          ['L-2', lease({ id: 'L-2', arBalance: -2500 })],
          ['L-3', lease({ id: 'L-3', arBalance: null })],
        ]),
      }),
      cases: [
        kase({ id: 'N-1', leaseId: 'L-1' }),
        kase({ id: 'N-2', leaseId: 'L-1', stage: 'default' }),
        kase({ id: 'N-3', leaseId: 'L-2' }),
        kase({ id: 'N-4', leaseId: 'L-3' }),
        kase({ id: 'N-5', leaseId: null }),
        kase({ id: 'N-6', leaseId: 'L-9' }),
        kase({ id: 'N-7', leaseId: 'L-1', stage: 'closed' }),
      ],
    });
    expect(s.money).toEqual({
      liveArCents: 97500,
      openCases: 6,
      casesWithoutBalance: 3,
      historyAvailable: false,
    });
  });
});

describe('the real seed at the data date', () => {
  const root = path.join(process.cwd(), 'data', 'seed');
  const summaryFor = async (personaId: string, asOf = ASOF) => {
    const seed = await readSeedDir(root);
    const persona = buildPersonas(seed).find((p) => p.id === personaId)!;
    return buildWeekSummary({
      persona,
      asOf,
      cases: seed.cases,
      events: seed.events,
      refs: buildLookups(seed),
      actorNames: {},
    });
  };

  it("matches Maya's counts", async () => {
    const s = await summaryFor('maya');
    expect(s.counts).toEqual({
      inScope: 37,
      open: 30,
      overdue: 8,
      dueSoon: 4,
      waitingOnLegal: 21,
      waitingOnAssetManagement: 9,
      newCases: 1,
      stageChanges: 0,
      curedOrClosed: 0,
    });
    expect(s.newCases.map((c) => [c.caseId, c.date])).toEqual([['N-006', '2026-10-12']]);
    expect(s.money).toMatchObject({ liveArCents: 59953509, openCases: 30, casesWithoutBalance: 0 });
    expect(s.waitingOnAssetManagement.map((g) => [g.person, g.cases.length])).toEqual([
      ['Grace Lin', 2],
      ['Lena Brooks', 4],
      ['Tom Reyes', 3],
    ]);
  });

  it("matches Lena Brooks's scope", async () => {
    const s = await summaryFor('am-lena-brooks');
    expect(s.counts).toMatchObject({
      inScope: 12,
      open: 11,
      waitingOnLegal: 7,
      waitingOnAssetManagement: 4,
    });
    expect(s.money.liveArCents).toBe(16761792);
  });

  it('is the same for the founder as for Legal', async () => {
    const [maya, founder] = [await summaryFor('maya'), await summaryFor('founder')];
    expect({ ...founder, viewer: '' }).toEqual({ ...maya, viewer: '' });
  });
});
