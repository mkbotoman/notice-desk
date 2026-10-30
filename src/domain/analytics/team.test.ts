import { describe, expect, it } from 'vitest';
import { makeCase, makeEvent } from '@/test/factories';
import type { Lease, Person, Property } from '../types';
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

const asOf = '2026-10-14';
const cal = (n: number) => ({ kind: 'days', n, unit: 'calendar' }) as const;
const overdue = { dateSent: '2026-10-01', curePeriod: cal(10) };
const soon = { dateSent: '2026-10-08', curePeriod: cal(10) };
const later = { dateSent: '2026-09-01', curePeriod: cal(90) };

const property = (id: string, over: Partial<Property> = {}): Property => ({
  id,
  name: `Property ${id}`,
  aliases: [],
  type: 'retail',
  city: 'Denver',
  state: 'CO',
  market: 'Denver',
  fund: 'Fund II',
  assetManagerId: 'PER-a',
  propertyManagerId: null,
  sqFt: null,
  acquiredDate: null,
  ...over,
});

const lease = (id: string, over: Partial<Lease> = {}): Lease => ({
  id,
  propertyId: 'P-1',
  tenantId: 'T-1',
  suite: null,
  sqFt: null,
  status: 'active',
  startDate: null,
  endDate: null,
  monthlyRent: null,
  arBalance: 0,
  arAgingRecorded: 'current',
  arAgingImplied: null,
  watchlistReasons: [],
  ...over,
});

const person = (id: string, name: string): Person => ({ id, name, roles: ['asset_manager'] });
const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));

describe('stageCounts', () => {
  it('lists the four open stages in pipeline order, with zeros', () => {
    const cases = [
      makeCase({ id: 'a', stage: 'default' }),
      makeCase({ id: 'b', stage: 'default' }),
      makeCase({ id: 'c', stage: 'collections' }),
      makeCase({ id: 'd', stage: 'cured' }),
    ];
    expect(stageCounts(cases)).toEqual([
      { stage: 'non_compliant', count: 0 },
      { stage: 'notice_to_cure', count: 0 },
      { stage: 'default', count: 2 },
      { stage: 'collections', count: 1 },
    ]);
  });
});

describe('dueCounts', () => {
  it('counts overdue and due-this-week, and ignores later, missing and non-notice cases', () => {
    const cases = [
      makeCase({ id: 'a', ...overdue }),
      makeCase({ id: 'b', ...soon }),
      makeCase({ id: 'c', ...later }),
      makeCase({ id: 'd', ...overdue, stage: 'default' }),
      makeCase({ id: 'e', curePeriod: { kind: 'unknown' } }),
    ];
    expect(dueCounts(cases, asOf)).toEqual({ overdue: 1, dueThisWeek: 1 });
  });
});

describe('sentTimeline', () => {
  it('buckets by month, fills quiet months with zero and reports coverage', () => {
    const cases = [
      makeCase({ id: 'a', dateSent: '2026-02-12' }),
      makeCase({ id: 'b', dateSent: '2026-02-20' }),
      makeCase({ id: 'c', dateSent: '2026-04-01' }),
    ];
    expect(sentTimeline(cases, new Map())).toEqual({
      months: [
        { month: '2026-02', count: 2 },
        { month: '2026-03', count: 0 },
        { month: '2026-04', count: 1 },
      ],
      from: '2026-02-12',
      to: '2026-04-01',
      undated: 0,
    });
  });

  it('spans a year boundary', () => {
    const cases = [
      makeCase({ id: 'a', dateSent: '2025-12-30' }),
      makeCase({ id: 'b', dateSent: '2026-01-02' }),
    ];
    expect(sentTimeline(cases, new Map()).months.map((m) => m.month)).toEqual([
      '2025-12',
      '2026-01',
    ]);
  });

  it('falls back to the case_opened event, then counts the rest as undated', () => {
    const cases = [
      makeCase({ id: 'opened', dateSent: null }),
      makeCase({ id: 'noted', dateSent: null }),
      makeCase({ id: 'bare', dateSent: null }),
      makeCase({ id: 'sent', dateSent: '2026-09-02' }),
    ];
    const events = new Map([
      [
        'opened',
        [makeEvent({ type: 'case_opened', caseId: 'opened', effectiveDate: '2026-10-05' })],
      ],
      ['noted', [makeEvent({ caseId: 'noted' })]],
    ]);
    const timeline = sentTimeline(cases, events);
    expect(timeline.months).toEqual([
      { month: '2026-09', count: 1 },
      { month: '2026-10', count: 1 },
    ]);
    expect(timeline).toMatchObject({ from: '2026-09-02', to: '2026-10-05', undated: 2 });
  });

  it('is empty when nothing has a date', () => {
    expect(sentTimeline([makeCase({ dateSent: null })], new Map())).toEqual({
      months: [],
      from: null,
      to: null,
      undated: 1,
    });
    expect(sentTimeline([], new Map()).undated).toBe(0);
  });
});

describe('workload', () => {
  const labels = { legal: 'Legal', asset_management: 'Asset Mgmt' } as const;

  it('splits open cases by owning team, with overdue counts', () => {
    const cases = [
      makeCase({ id: 'a', ...overdue }),
      makeCase({ id: 'b', ...soon, owner: 'asset_management' }),
    ];
    expect(teamWorkload(cases, labels, asOf)).toEqual([
      { key: 'legal', label: 'Legal', open: 1, overdue: 1 },
      { key: 'asset_management', label: 'Asset Mgmt', open: 1, overdue: 0 },
    ]);
  });

  it('groups Asset Management cases by the property asset manager', () => {
    const properties = byId([
      property('P-1'),
      property('P-2', { assetManagerId: 'PER-b' }),
      property('P-3', { assetManagerId: null }),
      property('P-4', { assetManagerId: 'PER-gone' }),
    ]);
    const people = byId([person('PER-a', 'Zed'), person('PER-b', 'Amy')]);
    const am = { owner: 'asset_management', ...later } as const;
    const cases = [
      makeCase({ id: '1', propertyId: 'P-1', ...am, ...overdue }),
      makeCase({ id: '2', propertyId: 'P-1', ...am }),
      makeCase({ id: '3', propertyId: 'P-2', ...am }),
      makeCase({ id: '4', propertyId: 'P-3', ...am }),
      makeCase({ id: '5', propertyId: 'P-4', ...am }),
      makeCase({ id: '6', propertyId: 'P-9', ...am }),
      makeCase({ id: '7', propertyId: null, leaseId: null, ...am }),
      makeCase({ id: '8', propertyId: 'P-1', owner: 'legal' }),
    ];
    expect(assetManagerWorkload(cases, properties, people, asOf)).toEqual([
      { key: 'unassigned', label: 'No asset manager', open: 4, overdue: 0 },
      { key: 'PER-a', label: 'Zed', open: 2, overdue: 1 },
      { key: 'PER-b', label: 'Amy', open: 1, overdue: 0 },
    ]);
  });

  it('breaks ties between asset managers by name', () => {
    const properties = byId([property('P-1'), property('P-2', { assetManagerId: 'PER-b' })]);
    const people = byId([person('PER-a', 'Zed'), person('PER-b', 'Amy')]);
    const am = { owner: 'asset_management', ...later } as const;
    const cases = [
      makeCase({ id: '1', propertyId: 'P-1', ...am }),
      makeCase({ id: '2', propertyId: 'P-2', ...am }),
    ];
    expect(assetManagerWorkload(cases, properties, people, asOf).map((r) => r.label)).toEqual([
      'Amy',
      'Zed',
    ]);
  });
});

describe('openCaseAr', () => {
  const properties = byId([
    property('P-1', { fund: 'Fund II' }),
    property('P-2', { fund: 'Income REIT' }),
  ]);
  const leases = byId([
    lease('L-1', { propertyId: 'P-1', arBalance: 100000 }),
    lease('L-2', { propertyId: 'P-1', arBalance: -2500 }),
    lease('L-3', { propertyId: 'P-2', arBalance: 50000 }),
    lease('L-4', { propertyId: 'P-2', arBalance: null }),
    lease('L-5', { propertyId: null, arBalance: 700 }),
    lease('L-6', { propertyId: 'P-gone', arBalance: 300 }),
  ]);
  const open = (id: string, leaseId: string | null) => makeCase({ id, leaseId });

  it('sums live balances once per lease and groups by property and fund', () => {
    const ar = openCaseAr(
      [
        open('1', 'L-1'),
        open('1b', 'L-1'),
        open('2', 'L-2'),
        open('3', 'L-3'),
        open('4', 'L-4'),
        open('5', 'L-5'),
        open('6', 'L-6'),
        open('7', null),
        open('8', 'L-missing'),
      ],
      leases,
      properties,
    );
    expect(ar.total).toBe(100000 - 2500 + 50000 + 700 + 300);
    expect(ar.byProperty).toEqual([
      { key: 'P-1', label: 'Property P-1', ar: 97500, leases: 2 },
      { key: 'P-2', label: 'Property P-2', ar: 50000, leases: 2 },
      { key: 'unknown', label: 'Unknown property', ar: 1000, leases: 2 },
    ]);
    expect(ar.byFund).toEqual([
      { key: 'Fund II', label: 'Fund II', ar: 97500, leases: 2 },
      { key: 'Income REIT', label: 'Income REIT', ar: 50000, leases: 2 },
      { key: 'unknown', label: 'Unknown fund', ar: 1000, leases: 2 },
    ]);
  });

  it('is zero with no open cases', () => {
    expect(openCaseAr([], leases, properties)).toEqual({ total: 0, byProperty: [], byFund: [] });
  });

  it('breaks ties by label', () => {
    const tied = byId([
      lease('L-1', { propertyId: 'P-2', arBalance: 5 }),
      lease('L-2', { propertyId: 'P-1', arBalance: 5 }),
    ]);
    const ar = openCaseAr([open('1', 'L-1'), open('2', 'L-2')], tied, properties);
    expect(ar.byProperty.map((r) => r.key)).toEqual(['P-1', 'P-2']);
  });
});

describe('cureRate', () => {
  it('is cured over cured plus closed', () => {
    const cases = [
      makeCase({ stage: 'cured' }),
      makeCase({ stage: 'cured' }),
      makeCase({ stage: 'closed' }),
      makeCase({ stage: 'default' }),
    ];
    expect(cureRate(cases)).toEqual({ cured: 2, closed: 1, resolved: 3, rate: 2 / 3 });
  });

  it('has no rate until something is resolved', () => {
    expect(cureRate([makeCase()])).toEqual({ cured: 0, closed: 0, resolved: 0, rate: null });
  });
});

describe('weeklyActivity', () => {
  it('counts app work by ISO week, fills empty weeks and skips other events', () => {
    // Recorded weeks after they happened: the chart must bucket by the date they happened.
    const on = (day: string) => ({ at: '2026-11-30T09:00:00.000Z', effectiveDate: day });
    const { weeks, total } = weeklyActivity([
      makeEvent({ ...on('2026-10-05') }),
      makeEvent({ ...on('2026-10-11') }),
      makeEvent({
        ...on('2026-10-26'),
        type: 'stage_changed',
        payload: { from: 'default', to: 'collections' },
      }),
      makeEvent({
        ...on('2026-10-27'),
        type: 'owner_changed',
        payload: { from: 'legal', to: 'asset_management' },
      }),
      makeEvent({ type: 'imported_note' }),
      makeEvent({ type: 'case_opened', payload: {} }),
      makeEvent({ type: 'notification_drafted', payload: { notificationId: 'n' } }),
    ]);
    expect(total).toBe(4);
    expect(weeks).toEqual([
      { week: '2026-10-05', notes: 2, stageChanges: 0, ownerChanges: 0 },
      { week: '2026-10-12', notes: 0, stageChanges: 0, ownerChanges: 0 },
      { week: '2026-10-19', notes: 0, stageChanges: 0, ownerChanges: 0 },
      { week: '2026-10-26', notes: 0, stageChanges: 1, ownerChanges: 1 },
    ]);
  });

  it('is empty when there is no app activity', () => {
    expect(weeklyActivity([makeEvent({ type: 'imported_note' })])).toEqual({ weeks: [], total: 0 });
    expect(weeklyActivity([])).toEqual({ weeks: [], total: 0 });
  });
});
