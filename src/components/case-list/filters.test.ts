import { describe, expect, it } from 'vitest';
import type { Case } from '@/domain/types';
import {
  EMPTY_FILTERS,
  UNKNOWN_PROPERTY,
  caseStats,
  filterCases,
  groupCases,
  groupKey,
  hasActiveFilters,
  parseFilters,
  writeFilters,
  type CaseFilters,
} from './filters';

const ASOF = '2026-10-13';

function makeCase(id: string, overrides: Partial<Case> = {}): Case {
  return {
    id,
    leaseId: `L-${id}`,
    tenantId: `T-${id}`,
    propertyId: 'P1',
    stage: 'notice_to_cure',
    issueType: 'monetary',
    dateSent: '2026-10-01',
    curePeriod: { kind: 'days', n: 10, unit: 'calendar' },
    owner: 'legal',
    amountOwedAtNotice: null,
    legalFeesTerms: null,
    lenderNotice: null,
    workflowStatus: null,
    courtCaseNo: null,
    guarantorName: null,
    hasGuarantor: false,
    ...overrides,
  };
}

const overdue = makeCase('a', { dateSent: '2026-09-01' });
const soon = makeCase('b', { dateSent: '2026-10-08', owner: 'asset_management' });
const later = makeCase('c', { dateSent: '2026-10-12', propertyId: 'P2' });
const missing = makeCase('d', { curePeriod: { kind: 'unknown' } });
const noCure = makeCase('e', { curePeriod: { kind: 'none' } });
const inDefault = makeCase('f', { stage: 'default', propertyId: null, dateSent: '2026-08-01' });
const cured = makeCase('g', { stage: 'cured' });
const all = [overdue, soon, later, missing, noCure, inDefault, cured];

const names = (c: Case) => ({
  tenant: c.id === 'a' ? 'Brightside Fitness' : `Tenant ${c.id}`,
  property: c.propertyId === 'P2' ? 'Seaside Village' : 'Harbor Commons',
});
const apply = (f: Partial<CaseFilters>) =>
  filterCases(all, { ...EMPTY_FILTERS, ...f }, ASOF, names).map((c) => c.id);

describe('parseFilters / writeFilters', () => {
  it('reads every filter from the URL', () => {
    const params = new URLSearchParams(
      'q=brightside&stage=default&owner=legal&property=P1&property=unknown&closed=1&due=week',
    );
    expect(parseFilters(params)).toEqual({
      q: 'brightside',
      stage: 'default',
      owner: 'legal',
      property: ['P1', 'unknown'],
      closed: true,
      due: 'week',
    });
  });

  it('falls back to no filter for empty or unrecognised values', () => {
    const params = new URLSearchParams(
      'stage=bogus&owner=nobody&due=never&closed=yes&property=P1&property=P1',
    );
    expect(parseFilters(params)).toEqual({ ...EMPTY_FILTERS, property: ['P1'] });
    expect(parseFilters(new URLSearchParams())).toEqual(EMPTY_FILTERS);
  });

  it('round-trips and leaves the shell params alone', () => {
    const filters: CaseFilters = {
      q: 'harbor',
      stage: 'notice_to_cure',
      owner: 'asset_management',
      property: ['P1', UNKNOWN_PROPERTY],
      closed: true,
      due: 'overdue',
    };
    const written = writeFilters(
      new URLSearchParams('as=maya&asOf=2026-11-02&stage=default'),
      filters,
    );
    expect(written.get('as')).toBe('maya');
    expect(written.get('asOf')).toBe('2026-11-02');
    expect(written.getAll('stage')).toEqual(['notice_to_cure']);
    expect(parseFilters(written)).toEqual(filters);
  });

  it('drops params for cleared filters', () => {
    const written = writeFilters(new URLSearchParams('q=x&owner=legal&as=maya'), {
      ...EMPTY_FILTERS,
      q: '   ',
    });
    expect(written.toString()).toBe('as=maya');
  });
});

describe('hasActiveFilters', () => {
  it('is false for the empty set and for a blank search', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, q: '  ' })).toBe(false);
  });

  it.each<Partial<CaseFilters>>([
    { q: 'a' },
    { stage: 'default' },
    { owner: 'legal' },
    { property: ['P1'] },
    { closed: true },
    { due: 'overdue' },
  ])('is true for %o', (f) => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, ...f })).toBe(true);
  });
});

describe('filterCases', () => {
  it('hides cured and closed cases unless asked', () => {
    expect(apply({})).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(apply({ closed: true })).toContain('g');
  });

  it('filters by stage, owner and property', () => {
    expect(apply({ stage: 'default' })).toEqual(['f']);
    expect(apply({ owner: 'asset_management' })).toEqual(['b']);
    expect(apply({ property: ['P2'] })).toEqual(['c']);
    expect(apply({ property: [UNKNOWN_PROPERTY] })).toEqual(['f']);
    expect(apply({ property: ['P2', UNKNOWN_PROPERTY] })).toEqual(['c', 'f']);
  });

  it('does not treat a finished case as waiting on anyone', () => {
    expect(apply({ closed: true, owner: 'legal' })).not.toContain('g');
  });

  it('filters by the deadline cards', () => {
    expect(apply({ due: 'overdue' })).toEqual(['a']);
    expect(apply({ due: 'week' })).toEqual(['b']);
  });

  it('searches tenant and property names, ignoring case and padding', () => {
    expect(apply({ q: '  BRIGHTSIDE ' })).toEqual(['a']);
    expect(apply({ q: 'seaside' })).toEqual(['c']);
    expect(apply({ q: 'nothing matches' })).toEqual([]);
  });

  it('combines filters', () => {
    expect(apply({ q: 'harbor', owner: 'legal', stage: 'notice_to_cure' })).toEqual([
      'a',
      'd',
      'e',
    ]);
  });
});

describe('groupKey / groupCases', () => {
  it('puts each case under the right heading', () => {
    expect(all.map((c) => groupKey(c, ASOF))).toEqual([
      'overdue',
      'week',
      'later',
      'missing',
      'none',
      'none',
      'closed',
    ]);
  });

  it('never calls a default or collections case overdue', () => {
    const old = makeCase('x', { stage: 'collections', dateSent: '2020-01-01' });
    expect(groupKey(old, ASOF)).toBe('none');
  });

  it('keeps the order given, in heading order, and skips empty groups', () => {
    const groups = groupCases([overdue, soon, noCure, cured], ASOF);
    expect(groups.map((g) => [g.key, g.cases.map((c) => c.id)])).toEqual([
      ['overdue', ['a']],
      ['week', ['b']],
      ['none', ['e']],
      ['closed', ['g']],
    ]);
    expect(groupCases([], ASOF)).toEqual([]);
  });
});

describe('caseStats', () => {
  it('counts deadlines and per-team waiting cases', () => {
    const stats = caseStats([overdue, soon, later, missing, noCure, inDefault], ASOF);
    expect(stats).toEqual({
      overdue: 1,
      dueThisWeek: 1,
      oldestOverdue: '2026-09-11',
      weekEnd: '2026-10-20',
      waiting: {
        legal: { total: 5, overdue: 1, dueThisWeek: 0 },
        asset_management: { total: 1, overdue: 0, dueThisWeek: 1 },
      },
    });
  });

  it('keeps the earliest overdue date, whatever the order', () => {
    const newer = makeCase('n', { dateSent: '2026-09-20' });
    expect(caseStats([newer, overdue], ASOF).oldestOverdue).toBe('2026-09-11');
    expect(caseStats([overdue, newer], ASOF).oldestOverdue).toBe('2026-09-11');
  });

  it('is empty for no cases and ignores finished ones', () => {
    expect(caseStats([], ASOF).oldestOverdue).toBeNull();
    expect(caseStats([cured], ASOF).waiting.legal.total).toBe(0);
  });
});
