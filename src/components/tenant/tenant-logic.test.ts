import { describe, expect, it } from 'vitest';
import type { Case, CaseEvent, CoiRecord, Lease, Persona, Tenant } from '@/domain/types';
import {
  actorLabeller,
  agingText,
  buildTenantRows,
  buildTimeline,
  coiDisplay,
  filterRows,
  openCaseForLease,
  propertyLine,
  sortRows,
} from './tenant-logic';

const lease = (id: string, tenantId: string, over: Partial<Lease> = {}): Lease => ({
  id,
  propertyId: 'P1',
  tenantId,
  suite: '1',
  sqFt: null,
  status: 'active',
  startDate: null,
  endDate: null,
  monthlyRent: 100000,
  arBalance: 0,
  arAgingRecorded: 'current',
  arAgingImplied: 'current',
  watchlistReasons: [],
  ...over,
});

const kase = (id: string, tenantId: string, over: Partial<Case> = {}): Case => ({
  id,
  leaseId: 'L1',
  tenantId,
  propertyId: 'P1',
  stage: 'notice_to_cure',
  issueType: 'monetary',
  dateSent: '2026-09-01',
  curePeriod: { kind: 'none' },
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

const persona = (scope: 'all' | string[]): Persona => ({
  id: 'maya',
  label: 'Lena',
  kind: scope === 'all' ? 'legal' : 'asset_manager',
  personId: null,
  team: 'legal',
  scopePropertyIds: scope,
});

const tenants: Tenant[] = [
  { id: 'T1', displayName: 'Brightside Fitness', nameVariants: ['BRIGHTSIDE FITNESS LLC'] },
  { id: 'T2', displayName: 'Acme', nameVariants: [] },
  { id: 'T3', displayName: 'Zed', nameVariants: [] },
];
const leasesByTenant = new Map<string, Lease[]>([
  [
    'T1',
    [
      lease('L1', 'T1', { arBalance: 5000 }),
      lease('L2', 'T1', { propertyId: 'P2', arBalance: 700 }),
    ],
  ],
  ['T2', [lease('L3', 'T2', { propertyId: null, arBalance: null })]],
  ['T3', [lease('L4', 'T3', { propertyId: 'P2', arBalance: 9000 })]],
]);
const cases = [
  kase('N1', 'T1'),
  kase('N2', 'T1', { leaseId: 'L2', propertyId: 'P2', stage: 'closed' }),
  kase('N3', 'T3', { leaseId: 'L4', propertyId: 'P2' }),
];

describe('buildTenantRows', () => {
  it('counts everything for an all-property persona, including leases with no property', () => {
    const rows = buildTenantRows(tenants, leasesByTenant, cases, persona('all'));
    expect(rows.map((r) => [r.tenant.id, r.leases.length, r.openCases, r.totalAr])).toEqual([
      ['T1', 2, 1, 5700],
      ['T2', 1, 0, 0],
      ['T3', 1, 1, 9000],
    ]);
  });

  it('keeps only in-scope leases, cases and tenants for a scoped persona', () => {
    const rows = buildTenantRows(tenants, leasesByTenant, cases, persona(['P1']));
    expect(rows.map((r) => [r.tenant.id, r.leases.length, r.openCases, r.totalAr])).toEqual([
      ['T1', 1, 1, 5000],
    ]);
  });
});

describe('filterRows and sortRows', () => {
  const rows = buildTenantRows(tenants, leasesByTenant, cases, persona('all'));

  it('searches names and other spellings, ignoring case and spacing', () => {
    expect(filterRows(rows, '  bright ').map((r) => r.tenant.id)).toEqual(['T1']);
    expect(filterRows(rows, 'fitness  llc').map((r) => r.tenant.id)).toEqual(['T1']);
    expect(filterRows(rows, 'nothing')).toEqual([]);
    expect(filterRows(rows, '')).toHaveLength(3);
  });

  it('sorts by name, open cases and AR in both directions with name tiebreak', () => {
    const ids = (k: 'name' | 'cases' | 'ar', d: 'asc' | 'desc') =>
      sortRows(rows, k, d).map((r) => r.tenant.id);
    expect(ids('name', 'asc')).toEqual(['T2', 'T1', 'T3']);
    expect(ids('name', 'desc')).toEqual(['T3', 'T1', 'T2']);
    expect(ids('cases', 'desc')).toEqual(['T1', 'T3', 'T2']);
    expect(ids('cases', 'asc')).toEqual(['T2', 'T1', 'T3']);
    expect(ids('ar', 'desc')).toEqual(['T3', 'T1', 'T2']);
    expect(ids('ar', 'asc')).toEqual(['T2', 'T1', 'T3']);
  });
});

describe('agingText', () => {
  it('shows both when they differ', () => {
    expect(agingText({ arAgingRecorded: '1_30', arAgingImplied: '61_90' })).toEqual({
      text: 'Recorded 1–30 days · balance implies 61–90 days',
      understated: true,
    });
  });
  it('does not flag a recorded aging that is worse than the balance implies', () => {
    expect(agingText({ arAgingRecorded: '31_60', arAgingImplied: 'current' }).understated).toBe(
      false,
    );
  });
  it('handles agreeing, missing and unknown values', () => {
    expect(agingText({ arAgingRecorded: 'current', arAgingImplied: 'current' }).text).toBe(
      'Recorded Current · balance agrees',
    );
    expect(agingText({ arAgingRecorded: '31_60', arAgingImplied: null })).toEqual({
      text: 'Recorded 31–60 days',
      understated: false,
    });
    expect(agingText({ arAgingRecorded: 'unknown', arAgingImplied: '31_60' })).toEqual({
      text: 'Recorded aging unknown · balance implies 31–60 days',
      understated: false,
    });
  });
});

describe('coiDisplay', () => {
  const rec = (over: Partial<CoiRecord>): CoiRecord => ({
    tenantId: 'T1',
    propertyId: 'P1',
    leaseIds: ['L1'],
    status: 'valid',
    expiresOn: '2027-03-12',
    ...over,
  });
  const asOf = '2026-10-13';
  it('reports no certificate for no record or a synthesized missing one', () => {
    expect(coiDisplay(undefined, asOf).label).toBe('No COI on file');
    expect(coiDisplay(rec({ status: 'missing', expiresOn: null }), asOf).label).toBe(
      'No COI on file',
    );
  });
  it('derives valid, expiring and expired from the as-of date', () => {
    expect(coiDisplay(rec({}), asOf)).toEqual({
      label: 'Valid until Mar 12, 2027',
      tone: 'success',
    });
    expect(coiDisplay(rec({}), '2027-03-01').tone).toBe('warning');
    expect(coiDisplay(rec({}), '2027-04-01')).toEqual({
      label: 'Expired Mar 12, 2027',
      tone: 'danger',
    });
  });
  it('passes through fixed statuses and undated records', () => {
    expect(coiDisplay(rec({ status: 'non_compliant' }), asOf).label).toBe('Non-compliant');
    expect(coiDisplay(rec({ status: 'unknown', expiresOn: null }), asOf).tone).toBe('gray');
    expect(coiDisplay(rec({ expiresOn: null }), asOf).label).toBe('Valid');
    expect(coiDisplay(rec({ status: 'expired', expiresOn: null }), asOf).label).toBe('Expired');
  });
});

describe('lease helpers', () => {
  it('finds the newest open case for a lease', () => {
    const list = [
      kase('A', 'T1', { dateSent: '2026-01-01' }),
      kase('B', 'T1', { dateSent: '2026-05-01' }),
      kase('C', 'T1', { dateSent: null }),
      kase('D', 'T1', { stage: 'cured', dateSent: '2026-09-09' }),
    ];
    expect(openCaseForLease(list, 'L1')?.id).toBe('B');
    expect(openCaseForLease(list, 'L9')).toBeUndefined();
  });
  it('describes the property or its absence', () => {
    expect(propertyLine(undefined)).toBe('Property not on file');
    expect(propertyLine({ name: 'Harbor', city: 'Reno' } as never)).toBe('Harbor, Reno');
  });
});

describe('buildTimeline', () => {
  const ev = (id: string, caseId: string, date: string, over: Partial<CaseEvent>): CaseEvent =>
    ({
      id,
      caseId,
      at: `${date}T10:00:00Z`,
      effectiveDate: date,
      actorPersonaId: 'maya',
      payload: {},
      type: 'note',
      ...over,
    }) as CaseEvent;
  const events = new Map<string, CaseEvent[]>([
    [
      'N1',
      [
        ev('e1', 'N1', '2026-09-01', { type: 'case_opened', actorPersonaId: 'import' }),
        ev('e2', 'N1', '2026-10-01', { note: ' <b>hi</b> ' }),
        ev('e3', 'N1', '2026-10-01', {
          type: 'stage_changed',
          payload: { from: 'non_compliant', to: 'notice_to_cure' },
          at: '2026-10-01T11:00:00Z',
        }),
        ev('e4', 'N1', '2026-10-02', {
          type: 'notification_sent',
          payload: { notificationId: 'n' },
        }),
      ],
    ],
    [
      'N2',
      [
        ev('e5', 'N2', '2026-09-15', {
          type: 'owner_changed',
          payload: { from: 'legal', to: 'asset_management' },
          actorPersonaId: 'ghost',
        }),
        ev('e6', 'N2', '2026-08-01', { type: 'imported_note', note: '  ' }),
      ],
    ],
  ]);
  const label = actorLabeller([persona('all')]);
  const out = buildTimeline([kase('N1', 'T1'), kase('N2', 'T1'), kase('N9', 'T1')], events, label);

  it('merges cases newest first and drops notification events', () => {
    expect(out.map((e) => e.id)).toEqual(['e3', 'e2', 'e5', 'e1', 'e6']);
  });
  it('words each event, keeps notes verbatim and labels actors', () => {
    expect(out[0].summary).toBe('Stage changed from Non-compliant to Notice to Cure');
    expect(out[1].note).toBe(' <b>hi</b> ');
    expect(out[2]).toMatchObject({
      summary: 'Owner changed from Legal to Asset Mgmt',
      actor: 'Unknown',
      caseId: 'N2',
    });
    expect(out[3].actor).toBe('Imported from Legal’s sheet');
    expect(out[4]).toMatchObject({ summary: 'Imported note', note: null });
    expect(out[1].actor).toBe('Lena');
  });
});
