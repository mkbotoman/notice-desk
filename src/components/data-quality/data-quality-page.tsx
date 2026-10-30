'use client';

import { useMemo, useState } from 'react';
import { Guard } from '@/components/shell/guard';
import { PageHeader } from '@/components/shell/page-header';
import { Button } from '@/components/ui/button';
import {
  NO_FILTERS,
  buildSections,
  filterIssues,
  hasFilters,
  recordHref,
  summarizeReport,
  type IssueFilters,
} from '@/domain/data-quality/report';
import {
  DQ_ACTIONS,
  DQ_SEVERITIES,
  type DataQualityAction,
  type DataQualitySeverity,
} from '@/domain/types';
import { useDataQuality } from '@/lib/data-quality-context';
import { useLookups } from '@/store/lookups';
import { useStoreState } from '@/store/react';
import { RuleSection } from './rule-section';

const CONTROL =
  'h-10 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const SEVERITY_LABELS: Record<DataQualitySeverity, string> = {
  error: 'Errors',
  warning: 'Warnings',
  info: 'Routine repairs (info)',
};
const ACTION_LABELS: Record<DataQualityAction, string> = {
  fixed: 'Fixed',
  flagged: 'Flagged',
  dropped: 'Dropped',
};

function Report() {
  const { issues } = useDataQuality();
  const { leaseById, tenantById, propertyById } = useLookups();
  const { cases } = useStoreState();
  const [filters, setFilters] = useState<IssueFilters>(NO_FILTERS);

  const summary = useMemo(
    () =>
      summarizeReport(
        { leases: leaseById.size, tenants: tenantById.size, properties: propertyById.size },
        issues,
      ),
    [issues, leaseById, tenantById, propertyById],
  );
  const sections = useMemo(() => buildSections(issues), [issues]);
  const caseIds = useMemo(() => new Set(cases.map((c) => c.id)), [cases]);
  const hrefFor = (rowRef: string) =>
    recordHref(rowRef, {
      tenantIdForLease: (id) => leaseById.get(id)?.tenantId,
      hasCase: (id) => caseIds.has(id),
    });

  return (
    <>
      <section className="flex flex-col gap-2 rounded-xl border bg-card p-5">
        <p data-testid="dq-summary" className="max-w-3xl text-base leading-relaxed">
          {summary.text}
        </p>
        <p className="text-sm text-muted-foreground">
          Guarantor SSNs are dropped when the files are read and are never stored.
        </p>
      </section>

      <div
        role="search"
        aria-label="Filter the report"
        className="flex flex-wrap items-center gap-2.5 rounded-xl border bg-card p-3"
      >
        <select
          aria-label="Severity"
          className={CONTROL}
          value={filters.severity ?? ''}
          onChange={(e) =>
            setFilters({
              ...filters,
              severity: (e.target.value || null) as DataQualitySeverity | null,
            })
          }
        >
          <option value="">All severities</option>
          {DQ_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          aria-label="Action taken"
          className={CONTROL}
          value={filters.action ?? ''}
          onChange={(e) =>
            setFilters({ ...filters, action: (e.target.value || null) as DataQualityAction | null })
          }
        >
          <option value="">Any action</option>
          {DQ_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
        {hasFilters(filters) ? (
          <Button variant="ghost" className="h-10" onClick={() => setFilters(NO_FILTERS)}>
            Clear filters
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        {sections.map((section) => (
          <RuleSection
            key={section.rule.id}
            section={section}
            visible={filterIssues(section.issues, filters)}
            filtered={hasFilters(filters)}
            hrefFor={hrefFor}
          />
        ))}
      </div>
    </>
  );
}

export function DataQualityPage() {
  return (
    <>
      <PageHeader
        title="Data quality"
        subtitle="How the four exports were cleaned on import. Every rule is listed, including the ones that found nothing."
      />
      <Guard requires="view_data_quality">
        <Report />
      </Guard>
    </>
  );
}
