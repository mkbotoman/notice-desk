'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { UNKNOWN_PROPERTY } from '@/components/case-list/filters';
import { Guard } from '@/components/shell/guard';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, LoadingState } from '@/components/shell/states';
import { Button } from '@/components/ui/button';
import { can, inScope } from '@/domain/permissions';
import type { SignalKind } from '@/domain/watchlist';
import { useAsOf, usePersona } from '@/lib/persona/context';
import { useLookups } from '@/store/lookups';
import { useStoreState } from '@/store/react';
import { useCaseActions } from '@/store/use-case-actions';
import { WatchlistRow } from './watchlist-row';
import {
  NO_WATCH_FILTERS,
  buildWatchlist,
  filterWatchlist,
  hasWatchFilters,
  splitWatchlist,
  type WatchlistFilters,
  type WatchlistRow as Row,
} from './watchlist-logic';

const CONTROL =
  'h-10 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const SIGNAL_OPTIONS: { kind: SignalKind; label: string }[] = [
  { kind: 'rent', label: 'Rent late' },
  { kind: 'insurance', label: 'Insurance' },
  { kind: 'listed', label: 'Listed risk' },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function WatchlistBody() {
  const { persona } = usePersona();
  const { asOf } = useAsOf();
  const { cases, hydrated } = useStoreState();
  const { leaseById, tenantById, propertyById, coiByLeaseId } = useLookups();
  const { openCase } = useCaseActions();
  const [filters, setFilters] = useState<WatchlistFilters>(NO_WATCH_FILTERS);
  const [notice, setNotice] = useState<
    { kind: 'ok'; caseId: string; tenant: string } | { kind: 'error'; message: string } | null
  >(null);

  const all = useMemo(
    () => buildWatchlist([...leaseById.values()], cases, coiByLeaseId, persona, asOf),
    [leaseById, cases, coiByLeaseId, persona, asOf],
  );
  const rows = useMemo(() => filterWatchlist(all, filters), [all, filters]);
  const { breaches, listed } = useMemo(() => splitWatchlist(rows), [rows]);
  const breachTotal = all.filter((r) => r.breach).length;
  const canOpen = can(persona, 'edit_case');

  const propertyOptions = useMemo(() => {
    const options = [...propertyById.values()]
      .filter((p) => inScope(persona, p.id))
      .map((p) => ({ id: p.id, name: p.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (inScope(persona, null)) options.push({ id: UNKNOWN_PROPERTY, name: 'Unknown property' });
    return options;
  }, [propertyById, persona]);

  if (!hydrated) return <LoadingState label="Loading the watchlist" />;

  const describe = (row: Row) => {
    const { lease } = row;
    const property = lease.propertyId ? propertyById.get(lease.propertyId)?.name : undefined;
    const name = property ?? 'Unknown property';
    return {
      tenantName: tenantById.get(lease.tenantId)?.displayName ?? 'Unknown tenant',
      place: lease.suite ? `${name} · Ste ${lease.suite}` : name,
    };
  };

  const open = (row: Row) => {
    try {
      const caseId = openCase(row.lease, row.signals);
      setNotice({ kind: 'ok', caseId, tenant: describe(row).tenantName });
    } catch (error) {
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : 'The case could not be opened.',
      });
    }
  };

  const list = (items: Row[], quiet: boolean) => (
    <ul className="overflow-hidden rounded-xl border bg-card">
      {items.map((row) => (
        <WatchlistRow
          key={row.lease.id}
          row={row}
          {...describe(row)}
          coi={coiByLeaseId.get(row.lease.id)}
          asOf={asOf}
          quiet={quiet}
          onOpenCase={canOpen ? () => open(row) : null}
        />
      ))}
    </ul>
  );

  return (
    <>
      <p data-testid="watchlist-count" className="sr-only">
        {breachTotal}
      </p>
      {notice?.kind === 'ok' ? (
        <p
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-success-line bg-success-soft px-4 py-3 text-sm text-success"
        >
          Case opened for {notice.tenant}.
          <Link
            href={`/cases/${encodeURIComponent(notice.caseId)}`}
            className="font-semibold underline"
          >
            View the case
          </Link>
        </p>
      ) : null}
      {notice?.kind === 'error' ? (
        <p
          role="alert"
          className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          {notice.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card p-3 text-sm">
        <span className="font-semibold text-gray-700">A lease shows up here when</span>
        <span className="text-gray-700">
          rent is 31+ days late (recorded or implied by the balance), its insurance certificate is
          expired, non-compliant or missing, or accounting listed a risk. It has no open case.
        </span>
      </div>

      <div
        role="search"
        aria-label="Filter the watchlist"
        className="flex flex-wrap items-center gap-2.5 rounded-xl border bg-card p-3"
      >
        <select
          aria-label="Signal"
          className={CONTROL}
          value={filters.signal ?? ''}
          onChange={(e) =>
            setFilters({ ...filters, signal: (e.target.value || null) as SignalKind | null })
          }
        >
          <option value="">All signals</option>
          {SIGNAL_OPTIONS.map((o) => (
            <option key={o.kind} value={o.kind}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Property"
          className={CONTROL}
          value={filters.property ?? ''}
          onChange={(e) => setFilters({ ...filters, property: e.target.value || null })}
        >
          <option value="">All properties</option>
          {propertyOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {hasWatchFilters(filters) ? (
          <Button variant="ghost" className="h-10" onClick={() => setFilters(NO_WATCH_FILTERS)}>
            Clear filters
          </Button>
        ) : null}
      </div>

      {all.length === 0 ? (
        <EmptyState title="Nothing on the watchlist">
          No lease in view has a warning sign without an open case.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title="No leases match these filters">
          Clear the filters to see the whole watchlist.
        </EmptyState>
      ) : (
        <>
          {breaches.length > 0 ? (
            <section aria-labelledby="wl-breaches" className="flex flex-col gap-3">
              <h2
                id="wl-breaches"
                className="text-xs font-bold tracking-wide text-gray-600 uppercase"
              >
                Looks non-compliant · {breaches.length}
              </h2>
              {list(breaches, false)}
            </section>
          ) : null}
          {listed.length > 0 ? (
            <section aria-labelledby="wl-listed" className="flex flex-col gap-3">
              <h2
                id="wl-listed"
                className="text-xs font-bold tracking-wide text-gray-600 uppercase"
              >
                Listed risks · {listed.length}
              </h2>
              <p className="text-sm text-muted-foreground">
                Accounting listed these, but rent and insurance are fine. They are a heads-up, not a
                breach.
              </p>
              {list(listed, true)}
            </section>
          ) : null}
        </>
      )}
      {canOpen ? (
        <p className="text-sm text-muted-foreground">
          Opening a case starts it as Non-compliant and assigns it to Legal.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Only Legal opens cases. You can see what is on the list.
        </p>
      )}
    </>
  );
}

export function Watchlist() {
  const { persona } = usePersona();
  const { cases } = useStoreState();
  const { leaseById, coiByLeaseId } = useLookups();
  const { asOf } = useAsOf();
  const breachCount = useMemo(
    () =>
      buildWatchlist([...leaseById.values()], cases, coiByLeaseId, persona, asOf).filter(
        (r) => r.breach,
      ).length,
    [leaseById, cases, coiByLeaseId, persona, asOf],
  );
  return (
    <>
      <PageHeader
        title="Watchlist"
        subtitle={`${plural(breachCount, 'lease')} look${breachCount === 1 ? 's' : ''} non-compliant but ${breachCount === 1 ? 'has' : 'have'} no case yet`}
      />
      <Guard requires="view_analytics">
        <WatchlistBody />
      </Guard>
    </>
  );
}
