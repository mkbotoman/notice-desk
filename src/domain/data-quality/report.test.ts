import { describe, expect, it } from 'vitest';
import type { DataQualityIssue } from '../types';
import {
  NO_FILTERS,
  buildSections,
  filterIssues,
  hasFilters,
  recordHref,
  summarizeReport,
} from './report';
import { DATA_QUALITY_RULES } from './rules';

const issue = (over: Partial<DataQualityIssue>): DataQualityIssue => ({
  ruleId: 'DQ-DATE',
  severity: 'info',
  file: 'leases',
  rowRef: 'L-1',
  field: 'start_date',
  message: 'm',
  action: 'fixed',
  ...over,
});

describe('rules', () => {
  it('lists every rule in the reference doc once', () => {
    const ids = DATA_QUALITY_RULES.map((r) => r.id);
    expect(ids).toHaveLength(16);
    expect(new Set(ids).size).toBe(16);
    expect(ids.slice(0, 3)).toEqual(['DQ-DATE', 'DQ-MONEY', 'DQ-ENUM']);
    for (const r of DATA_QUALITY_RULES) expect(r.checks.length).toBeGreaterThan(10);
  });
});

describe('buildSections', () => {
  it('has a section for every rule, empty ones included, with tallies', () => {
    const sections = buildSections([
      issue({}),
      issue({ severity: 'warning', action: 'flagged' }),
      issue({ ruleId: 'DQ-CURE', severity: 'error', action: 'dropped' }),
    ]);
    expect(sections).toHaveLength(16);
    const date = sections[0];
    expect(date.issues).toHaveLength(2);
    expect(date.bySeverity).toEqual({ error: 0, warning: 1, info: 1 });
    expect(date.byAction).toEqual({ fixed: 1, flagged: 1, dropped: 0 });
    const cure = sections.find((s) => s.rule.id === 'DQ-CURE')!;
    expect(cure.bySeverity.error).toBe(1);
    expect(sections.find((s) => s.rule.id === 'DQ-PII')!.issues).toEqual([]);
  });

  it('appends a section for a rule id it has no copy for', () => {
    const sections = buildSections([issue({ ruleId: 'DQ-NEW' }), issue({ ruleId: 'DQ-NEW' })]);
    expect(sections).toHaveLength(17);
    expect(sections[16].rule.id).toBe('DQ-NEW');
    expect(sections[16].issues).toHaveLength(2);
  });
});

describe('filterIssues', () => {
  const issues = [
    issue({ severity: 'info', action: 'fixed' }),
    issue({ severity: 'warning', action: 'flagged' }),
    issue({ severity: 'warning', action: 'dropped' }),
  ];
  it('passes everything with no filters', () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(filterIssues(issues, NO_FILTERS)).toHaveLength(3);
  });
  it('filters by severity, by action, and by both', () => {
    expect(hasFilters({ severity: 'warning', action: null })).toBe(true);
    expect(hasFilters({ severity: null, action: 'fixed' })).toBe(true);
    expect(filterIssues(issues, { severity: 'warning', action: null })).toHaveLength(2);
    expect(filterIssues(issues, { severity: null, action: 'fixed' })).toHaveLength(1);
    expect(filterIssues(issues, { severity: 'warning', action: 'dropped' })).toHaveLength(1);
    expect(filterIssues(issues, { severity: 'info', action: 'dropped' })).toHaveLength(0);
  });
});

describe('recordHref', () => {
  const resolve = {
    tenantIdForLease: (id: string) => (id === 'L-1' ? 'T 1' : undefined),
    hasCase: (id: string) => id === 'N-1',
  };
  it('links leases to tenants and notices to cases', () => {
    expect(recordHref('L-1', resolve)).toBe('/tenants/T%201');
    expect(recordHref('N-1', resolve)).toBe('/cases/N-1');
  });
  it('gives row numbers, properties and unknown ids no link', () => {
    expect(recordHref('row 54', resolve)).toBeNull();
    expect(recordHref('P-099', resolve)).toBeNull();
  });
});

describe('summarizeReport', () => {
  const totals = { leases: 174, tenants: 74, properties: 21 };
  it('counts routine repairs, review items and merged variants', () => {
    const s = summarizeReport(totals, [
      issue({}),
      issue({}),
      issue({ ruleId: 'DQ-TENANT', action: 'fixed' }),
      issue({ ruleId: 'DQ-TENANT', action: 'flagged', severity: 'warning' }),
    ]);
    expect(s).toMatchObject({ routine: 3, needsReview: 1, dropped: 0, merged: 1 });
    expect(s.text).toBe(
      '174 leases on 21 properties, 74 tenants (1 name variant merged). ' +
        '4 entries in the import report: 3 routine repairs made automatically, 1 flagged for review.',
    );
  });
  it('handles singulars, no merges and dropped rows', () => {
    const s = summarizeReport({ leases: 1, tenants: 1, properties: 1 }, [
      issue({ severity: 'info', action: 'dropped' }),
    ]);
    expect(s.text).toBe(
      '1 lease on 1 property, 1 tenant. ' +
        '1 entry in the import report: 1 routine repair made automatically, 0 flagged for review. 1 row dropped.',
    );
  });
  it('pluralizes merged variants', () => {
    const merged = issue({ ruleId: 'DQ-TENANT', action: 'fixed' });
    expect(summarizeReport(totals, [merged, merged]).text).toContain('2 name variants merged');
  });
});
