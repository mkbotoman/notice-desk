import { describe, expect, it } from 'vitest';
import { makeCase } from '@/test/factories';
import type { Persona } from './types';
import {
  casesByTenant,
  casesInScope,
  openCases,
  sortByUrgency,
  waitingOnPersona,
} from './selectors';

const asOf = '2026-10-14';
const cal = (n: number) => ({ kind: 'days', n, unit: 'calendar' }) as const;
const persona = (over: Partial<Persona>): Persona => ({
  id: 'p',
  label: 'p',
  kind: 'asset_manager',
  personId: 'PER-1',
  team: 'asset_management',
  scopePropertyIds: ['P-1'],
  ...over,
});

describe('openCases', () => {
  it('drops cured and closed cases', () => {
    const cases = [
      makeCase({ id: 'a' }),
      makeCase({ id: 'b', stage: 'cured' }),
      makeCase({ id: 'c', stage: 'closed' }),
    ];
    expect(openCases(cases).map((c) => c.id)).toEqual(['a']);
  });
});

describe('scope', () => {
  const cases = [
    makeCase({ id: 'in', propertyId: 'P-1' }),
    makeCase({ id: 'out', propertyId: 'P-2' }),
    makeCase({ id: 'orphan', leaseId: null, propertyId: null }),
  ];

  it('limits a scoped persona to its properties, and lets "all" see everything', () => {
    expect(casesInScope(cases, persona({})).map((c) => c.id)).toEqual(['in']);
    expect(casesInScope(cases, persona({ scopePropertyIds: 'all' })).map((c) => c.id)).toEqual([
      'in',
      'out',
      'orphan',
    ]);
  });

  it('finds what is waiting on a persona: open, in scope, with their team', () => {
    const waiting = [
      makeCase({ id: 'mine', owner: 'asset_management' }),
      makeCase({ id: 'legal-court', owner: 'legal' }),
      makeCase({ id: 'elsewhere', owner: 'asset_management', propertyId: 'P-2' }),
      makeCase({ id: 'done', owner: 'asset_management', stage: 'closed' }),
    ];
    expect(waitingOnPersona(waiting, persona({})).map((c) => c.id)).toEqual(['mine']);
    expect(waitingOnPersona(waiting, persona({ kind: 'property_manager', team: null }))).toEqual(
      [],
    );
  });
});

describe('casesByTenant', () => {
  it('groups a tenant’s cases together', () => {
    const grouped = casesByTenant([
      makeCase({ id: 'a', tenantId: 'T-1' }),
      makeCase({ id: 'b', tenantId: 'T-2' }),
      makeCase({ id: 'c', tenantId: 'T-1' }),
    ]);
    expect(grouped.get('T-1')?.map((c) => c.id)).toEqual(['a', 'c']);
    expect(grouped.get('T-2')?.map((c) => c.id)).toEqual(['b']);
  });
});

describe('sortByUrgency', () => {
  it('puts live deadlines first in date order, then unreadable ones, then the rest by stage', () => {
    const cases = [
      makeCase({ id: 'collections', stage: 'collections' }),
      makeCase({ id: 'later', dateSent: '2026-10-09', curePeriod: cal(30) }),
      makeCase({ id: 'unreadable-b', curePeriod: { kind: 'unknown' }, dateSent: null }),
      makeCase({ id: 'overdue', dateSent: '2026-09-01', curePeriod: cal(10) }),
      makeCase({ id: 'unreadable-a', curePeriod: { kind: 'unknown' }, dateSent: '2026-10-01' }),
      makeCase({
        id: 'noncompliant',
        stage: 'non_compliant',
        dateSent: null,
        curePeriod: { kind: 'none' },
      }),
      makeCase({ id: 'soon', dateSent: '2026-10-09', curePeriod: cal(10) }),
      makeCase({ id: 'default-old', stage: 'default', dateSent: '2026-08-01' }),
      makeCase({ id: 'default-older', stage: 'default', dateSent: '2026-07-01' }),
      makeCase({
        id: 'default-none',
        stage: 'default',
        dateSent: null,
        curePeriod: { kind: 'none' },
      }),
    ];
    expect(sortByUrgency(cases, asOf).map((c) => c.id)).toEqual([
      'overdue',
      'soon',
      'later',
      'unreadable-a',
      'unreadable-b',
      'noncompliant',
      'default-older',
      'default-old',
      'default-none',
      'collections',
    ]);
  });

  it('breaks ties by case id and does not mutate its input', () => {
    const cases = [makeCase({ id: 'b' }), makeCase({ id: 'a' })];
    expect(sortByUrgency(cases, asOf).map((c) => c.id)).toEqual(['a', 'b']);
    expect(cases.map((c) => c.id)).toEqual(['b', 'a']);
  });
});
