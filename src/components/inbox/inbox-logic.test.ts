import { describe, expect, it } from 'vitest';
import type { Case, CoiRecord, Lease, Persona } from '@/domain/types';
import { groupWaiting, troubledLeases } from './inbox-logic';

const ASOF = '2026-10-13';

const kase = (id: string, over: Partial<Case> = {}): Case => ({
  id,
  leaseId: `L-${id}`,
  tenantId: `T-${id}`,
  propertyId: 'P1',
  stage: 'notice_to_cure',
  issueType: 'monetary',
  dateSent: '2026-10-01',
  curePeriod: { kind: 'days', n: 30, unit: 'calendar' },
  owner: 'asset_management',
  amountOwedAtNotice: null,
  legalFeesTerms: null,
  lenderNotice: null,
  workflowStatus: null,
  courtCaseNo: null,
  guarantorName: null,
  hasGuarantor: false,
  ...over,
});

const lease = (id: string, over: Partial<Lease> = {}): Lease => ({
  id,
  propertyId: 'P1',
  tenantId: `T-${id}`,
  suite: null,
  sqFt: null,
  status: 'active',
  startDate: null,
  endDate: null,
  monthlyRent: 100000,
  arBalance: 0,
  arAgingRecorded: 'current',
  arAgingImplied: null,
  watchlistReasons: [],
  ...over,
});

const am: Persona = {
  id: 'am',
  label: 'Lena',
  kind: 'asset_manager',
  personId: 'x',
  team: 'asset_management',
  scopePropertyIds: ['P1'],
};
const legal: Persona = { ...am, id: 'maya', kind: 'legal', team: 'legal', scopePropertyIds: 'all' };
const founder: Persona = { ...legal, id: 'founder', kind: 'founder', team: null };
const pm: Persona = { ...am, id: 'pm', kind: 'property_manager', team: null };

describe('groupWaiting', () => {
  const cases = [
    kase('later', { dateSent: '2026-10-12' }),
    kase('over', { dateSent: '2026-08-01' }),
    kase('week', { dateSent: '2026-09-15' }),
    kase('missing', { curePeriod: { kind: 'unknown' } }),
    kase('none', { stage: 'default' }),
    kase('noneCure', { stage: 'non_compliant', curePeriod: { kind: 'none' } }),
    kase('legal', { owner: 'legal' }),
    kase('done', { stage: 'closed' }),
    kase('elsewhere', { propertyId: 'P2' }),
  ];

  it('buckets by deadline, most urgent first, only non-empty groups', () => {
    const groups = groupWaiting(cases, am, ASOF);
    expect(groups.map((g) => [g.key, g.cases.map((c) => c.id)])).toEqual([
      ['overdue', ['over']],
      ['due_this_week', ['week']],
      ['later', ['later']],
      ['missing', ['missing']],
      ['none', ['noneCure', 'none']],
    ]);
  });

  it('puts day 7 in due this week and day 8 in later', () => {
    const edge = [kase('d7', { dateSent: '2026-09-20' }), kase('d8', { dateSent: '2026-09-21' })];
    const groups = groupWaiting(edge, am, ASOF);
    expect(groups.map((g) => [g.key, g.cases[0].id])).toEqual([
      ['due_this_week', 'd7'],
      ['later', 'd8'],
    ]);
  });

  it("shows Legal's court to Legal and nothing to a persona without a team", () => {
    expect(groupWaiting(cases, legal, ASOF).flatMap((g) => g.cases.map((c) => c.id))).toEqual([
      'legal',
    ]);
    expect(groupWaiting(cases, founder, ASOF)).toEqual([]);
  });
});

describe('troubledLeases', () => {
  const validCoi: CoiRecord = {
    tenantId: 't',
    propertyId: 'P1',
    leaseIds: [],
    status: 'valid',
    expiresOn: '2027-12-31',
  };
  const coi = new Map<string, CoiRecord>(
    ['clean', 'rent', 'caseOnly', 'both', 'orphanProp', 'other'].map((id) => [id, validCoi]),
  );

  const leases = [
    lease('clean'),
    lease('rent', { arAgingRecorded: '61_90' }),
    lease('caseOnly'),
    lease('both', { arAgingRecorded: '90_plus', watchlistReasons: ['Going dark'] }),
    lease('noCoi'),
    lease('orphanProp', { propertyId: null, arAgingRecorded: '31_60' }),
    lease('other', { propertyId: 'P2', arAgingRecorded: '31_60' }),
  ];
  const cases = [
    kase('c1', { leaseId: 'caseOnly' }),
    kase('c2', { leaseId: 'both' }),
    kase('c3', { leaseId: 'both', dateSent: '2026-08-01' }),
    kase('c4', { leaseId: 'clean', stage: 'cured' }),
    kase('c5', { leaseId: null }),
  ];

  it('keeps leases with an open case or a signal: open cases first, then by signal count', () => {
    const rows = troubledLeases(leases, cases, coi, am, ASOF);
    expect(rows.map((r) => r.lease.id)).toEqual(['both', 'caseOnly', 'noCoi', 'rent']);
    expect(rows[0].openCase?.id).toBe('c3');
    expect(rows[1].signals).toEqual([]);
    expect(rows[2].signals.map((s) => s.kind)).toEqual(['insurance']);
  });

  it('counts a missing COI as an insurance signal', () => {
    const rows = troubledLeases([lease('noCoi')], [], new Map(), am, ASOF);
    expect(rows[0].signals[0].label).toBe('No insurance on file');
  });

  it('only includes leases with no property for all-property personas', () => {
    const forAm = troubledLeases(leases, cases, coi, am, ASOF).map((r) => r.lease.id);
    expect(forAm).not.toContain('orphanProp');
    expect(forAm).not.toContain('other');
    const forLegal = troubledLeases(leases, cases, coi, legal, ASOF).map((r) => r.lease.id);
    expect(forLegal).toContain('orphanProp');
    expect(forLegal).toContain('other');
  });

  it('works for personas with no team that may view cases', () => {
    expect(troubledLeases(leases, cases, coi, founder, ASOF).length).toBeGreaterThan(0);
    expect(troubledLeases(leases, cases, coi, pm, ASOF).length).toBeGreaterThan(0);
  });
});
