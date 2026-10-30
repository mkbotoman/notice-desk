import {
  DQ_ACTIONS,
  DQ_SEVERITIES,
  type DataQualityAction,
  type DataQualityIssue,
  type DataQualitySeverity,
} from '../types';
import { DATA_QUALITY_RULES, type DataQualityRule } from './rules';

export interface RuleSection {
  rule: DataQualityRule;
  issues: DataQualityIssue[];
  bySeverity: Record<DataQualitySeverity, number>;
  byAction: Record<DataQualityAction, number>;
}

const tally = <K extends string>(keys: readonly K[], values: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, values.filter((v) => v === k).length])) as Record<
    K,
    number
  >;

/** One section per known rule, in document order, including rules that found nothing. */
export function buildSections(issues: readonly DataQualityIssue[]): RuleSection[] {
  const known = new Set(DATA_QUALITY_RULES.map((r) => r.id));
  // A rule id the page has no copy for must still show up, so the report is never hidden.
  const unknown = [...new Set(issues.map((i) => i.ruleId))]
    .filter((id) => !known.has(id))
    .map((id) => ({ id, title: id, checks: 'No description available.', response: '' }));
  return [...DATA_QUALITY_RULES, ...unknown].map((rule) => {
    const own = issues.filter((i) => i.ruleId === rule.id);
    return {
      rule,
      issues: own,
      bySeverity: tally(
        DQ_SEVERITIES,
        own.map((i) => i.severity),
      ),
      byAction: tally(
        DQ_ACTIONS,
        own.map((i) => i.action),
      ),
    };
  });
}

export interface IssueFilters {
  severity: DataQualitySeverity | null;
  action: DataQualityAction | null;
}

export const NO_FILTERS: IssueFilters = { severity: null, action: null };

export const hasFilters = (f: IssueFilters) => f.severity !== null || f.action !== null;

export function filterIssues(
  issues: readonly DataQualityIssue[],
  filters: IssueFilters,
): DataQualityIssue[] {
  return issues.filter(
    (i) =>
      (filters.severity === null || i.severity === filters.severity) &&
      (filters.action === null || i.action === filters.action),
  );
}

export interface RecordResolvers {
  tenantIdForLease: (id: string) => string | undefined;
  hasCase: (id: string) => boolean;
}

/**
 * Where to read about the record an issue points at: a lease goes to its tenant's page, a notice
 * to its case. Row numbers, property ids and records that were dropped have no page.
 */
export function recordHref(rowRef: string, resolve: RecordResolvers): string | null {
  const tenantId = resolve.tenantIdForLease(rowRef);
  if (tenantId !== undefined) return `/tenants/${encodeURIComponent(tenantId)}`;
  if (resolve.hasCase(rowRef)) return `/cases/${encodeURIComponent(rowRef)}`;
  return null;
}

export interface ReportTotals {
  leases: number;
  tenants: number;
  properties: number;
}

export interface ReportSummary {
  text: string;
  routine: number;
  needsReview: number;
  dropped: number;
  merged: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The plain-words account of what the import did. Every number is counted, none typed in. */
export function summarizeReport(
  totals: ReportTotals,
  issues: readonly DataQualityIssue[],
): ReportSummary {
  const routine = issues.filter((i) => i.severity === 'info').length;
  const needsReview = issues.length - routine;
  const dropped = issues.filter((i) => i.action === 'dropped').length;
  const merged = issues.filter((i) => i.ruleId === 'DQ-TENANT' && i.action === 'fixed').length;

  const tenants = plural(totals.tenants, 'tenant');
  const parts = [
    `${plural(totals.leases, 'lease')} on ${plural(totals.properties, 'property', 'properties')}, ` +
      `${merged > 0 ? `${tenants} (${plural(merged, 'name variant')} merged)` : tenants}.`,
    `${plural(issues.length, 'entry', 'entries')} in the import report: ` +
      `${plural(routine, 'routine repair')} made automatically, ${needsReview} flagged for review.`,
  ];
  if (dropped > 0) parts.push(`${plural(dropped, 'row')} dropped.`);
  return { text: parts.join(' '), routine, needsReview, dropped, merged };
}
