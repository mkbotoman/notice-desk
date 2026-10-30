'use client';

import { useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Guard } from '@/components/shell/guard';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState } from '@/components/shell/states';
import { Stat } from '@/components/ui/stat';
import { Button } from '@/components/ui/button';
import { can, inScope } from '@/domain/permissions';
import { casesInScope, openCases, sortByUrgency } from '@/domain/selectors';
import { isTerminal } from '@/domain/stage';
import type { Case } from '@/domain/types';
import { issuesNeedingReview, useDataQuality } from '@/lib/data-quality-context';
import { shortDate, weekdayDate } from '@/lib/format';
import { useAsOf, usePersona } from '@/lib/persona/context';
import { cn } from '@/lib/utils';
import { useLookups } from '@/store/lookups';
import { useStoreState } from '@/store/react';
import { CaseTable, type CaseRow } from './case-table';
import { FilterBar, type PropertyOption } from './filter-bar';
import {
  EMPTY_FILTERS,
  UNKNOWN_PROPERTY,
  caseStats,
  filterCases,
  groupCases,
  hasActiveFilters,
  parseFilters,
  writeFilters,
  type CaseFilters,
  type DueFilter,
  type TeamStats,
} from './filters';

function teamDetail(t: TeamStats): string {
  const parts = [];
  if (t.overdue > 0) parts.push(`${t.overdue} overdue`);
  if (t.dueThisWeek > 0) parts.push(`${t.dueThisWeek} due this week`);
  return parts.length > 0 ? parts.join(' · ') : 'Nothing overdue or due soon';
}

/** A Stat that filters the list when clicked and says so to assistive tech. */
function StatButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        active && 'ring-2 ring-navy',
      )}
    >
      {children}
    </button>
  );
}

export function CaseList() {
  const { persona } = usePersona();
  const { asOf } = useAsOf();
  const { cases } = useStoreState();
  const lookups = useLookups();
  const { byRowRef } = useDataQuality();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlFilters = useMemo(() => parseFilters(new URLSearchParams(searchParams)), [searchParams]);
  // The URL catches up a moment after replaceState; until then show what was just chosen so
  // controlled inputs don't snap back and fast typing doesn't drop characters.
  const [pending, setPending] = useState<{ base: URLSearchParams; value: CaseFilters } | null>(
    null,
  );
  const filters = pending && pending.base === searchParams ? pending.value : urlFilters;
  const setFilters = (next: CaseFilters) => {
    setPending({ base: searchParams, value: next });
    const query = writeFilters(new URLSearchParams(searchParams), next).toString();
    window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
  };

  const inView = useMemo(() => casesInScope(cases, persona), [cases, persona]);
  const open = useMemo(() => openCases(inView), [inView]);
  const stats = useMemo(() => caseStats(open, asOf), [open, asOf]);

  const propertyOptions = useMemo<PropertyOption[]>(() => {
    const options = [...lookups.propertyById.values()]
      .filter((p) => inScope(persona, p.id))
      .map((p) => ({ id: p.id, name: p.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (inScope(persona, null)) options.push({ id: UNKNOWN_PROPERTY, name: 'Unknown property' });
    return options;
  }, [lookups, persona]);

  const describe = (c: Case) => {
    const lease = c.leaseId ? lookups.leaseById.get(c.leaseId) : undefined;
    const property = c.propertyId ? lookups.propertyById.get(c.propertyId) : undefined;
    return { lease, propertyName: property?.name ?? 'Unknown property' };
  };

  const visible = useMemo(() => {
    const names = (c: Case) => ({
      tenant: lookups.tenantById.get(c.tenantId)?.displayName ?? '',
      property: describe(c).propertyName,
    });
    return sortByUrgency(filterCases(inView, filters, asOf, names), asOf);
    // describe only reads lookups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, filters, asOf, lookups]);
  const groups = useMemo(() => groupCases(visible, asOf), [visible, asOf]);

  const canSeeDataQuality = can(persona, 'view_data_quality');
  const rows = useMemo(() => {
    const byId = new Map<string, CaseRow>();
    for (const c of visible) {
      const { lease, propertyName } = describe(c);
      const owed = lease?.arBalance ?? null;
      byId.set(c.id, {
        case: c,
        tenant: lookups.tenantById.get(c.tenantId)?.displayName ?? 'Unknown tenant',
        place: lease?.suite ? `${propertyName} · Ste ${lease.suite}` : propertyName,
        owed,
        owedChanged: c.amountOwedAtNotice !== null && owed !== c.amountOwedAtNotice,
        hasDataCheck: issuesNeedingReview(byRowRef, c.id, c.leaseId).length > 0,
        dataCheckHref: canSeeDataQuality ? '/data-quality' : null,
      });
    }
    return byId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, lookups, byRowRef, canSeeDataQuality]);

  const toggleDue = (due: DueFilter) =>
    setFilters({ ...filters, due: filters.due === due ? null : due });
  const toggleOwner = (owner: 'legal' | 'asset_management') =>
    setFilters({ ...filters, owner: filters.owner === owner ? null : owner });

  const total = filters.closed ? inView.length : open.length;
  const closedShown = visible.filter((c) => isTerminal(c.stage)).length;

  return (
    <>
      <PageHeader
        title="Cases"
        subtitle={`${open.length} open ${open.length === 1 ? 'case' : 'cases'}, sorted by cure deadline`}
      />
      <Guard requires="view_case">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatButton active={filters.due === 'overdue'} onClick={() => toggleDue('overdue')}>
            <Stat
              value={stats.overdue}
              label="Overdue"
              tone="danger"
              detail={
                stats.oldestOverdue
                  ? `Oldest cure date ${shortDate(stats.oldestOverdue)}`
                  : 'Nothing overdue'
              }
            />
          </StatButton>
          <StatButton active={filters.due === 'week'} onClick={() => toggleDue('week')}>
            <Stat
              value={stats.dueThisWeek}
              label="Due this week"
              tone="warning"
              detail={`Through ${weekdayDate(stats.weekEnd)}`}
            />
          </StatButton>
          <StatButton active={filters.owner === 'legal'} onClick={() => toggleOwner('legal')}>
            <Stat
              value={stats.waiting.legal.total}
              label="Waiting on Legal"
              detail={teamDetail(stats.waiting.legal)}
            />
          </StatButton>
          <StatButton
            active={filters.owner === 'asset_management'}
            onClick={() => toggleOwner('asset_management')}
          >
            <Stat
              value={stats.waiting.asset_management.total}
              label="Waiting on Asset Mgmt"
              detail={teamDetail(stats.waiting.asset_management)}
            />
          </StatButton>
        </div>

        <FilterBar
          filters={filters}
          onChange={setFilters}
          properties={propertyOptions}
          showClosedStages={filters.closed}
        />

        {visible.length === 0 ? (
          <EmptyState
            title={hasActiveFilters(filters) ? 'No cases match these filters' : 'No open cases'}
            action={
              hasActiveFilters(filters) ? (
                <Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>
                  Clear filters
                </Button>
              ) : undefined
            }
          >
            {hasActiveFilters(filters)
              ? 'Try a different search, or clear the filters to see every open case.'
              : 'Nothing is open for the properties this person looks after.'}
          </EmptyState>
        ) : (
          <CaseTable groups={groups} rows={rows} asOf={asOf} weekEnd={stats.weekEnd} />
        )}

        <p className="text-[13px] text-muted-foreground" data-testid="case-count">
          {filters.closed
            ? `Showing ${visible.length} of ${total} cases (${closedShown} cured or closed)`
            : `Showing ${visible.length} of ${total} open ${total === 1 ? 'case' : 'cases'}`}
        </p>
      </Guard>
    </>
  );
}
