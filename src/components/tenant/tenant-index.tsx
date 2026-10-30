'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Guard } from '@/components/shell/guard';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, LoadingState } from '@/components/shell/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCents } from '@/lib/format';
import { usePersona } from '@/lib/persona/context';
import { useLookups } from '@/store/lookups';
import { useStoreState } from '@/store/react';
import {
  buildTenantRows,
  filterRows,
  sortRows,
  type SortDir,
  type SortKey,
  type TenantRow,
} from './tenant-logic';

const SORTS: { key: SortKey; label: string; firstDir: SortDir }[] = [
  { key: 'name', label: 'Name', firstDir: 'asc' },
  { key: 'cases', label: 'Open cases', firstDir: 'desc' },
  { key: 'ar', label: 'Total AR', firstDir: 'desc' },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function TenantListRow({ row }: { row: TenantRow }) {
  return (
    <li>
      <Link
        href={`/tenants/${row.tenant.id}`}
        className="grid grid-cols-3 items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-navy-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:grid-cols-[minmax(0,1fr)_6rem_7rem_8rem]"
      >
        <span className="col-span-3 font-semibold text-navy sm:col-span-1">
          {row.tenant.displayName}
        </span>
        <span className="text-sm text-gray-700">
          <span className="block text-xs text-muted-foreground sm:hidden">Leases</span>
          {plural(row.leases.length, 'lease')}
        </span>
        <span className="text-sm text-gray-700">
          <span className="block text-xs text-muted-foreground sm:hidden">Open cases</span>
          {row.openCases}
          <span className="sr-only"> open cases</span>
        </span>
        <span className="text-right text-sm font-semibold tabular-nums sm:text-right">
          <span className="block text-xs font-normal text-muted-foreground sm:hidden">
            Total AR
          </span>
          {formatCents(row.totalAr)}
        </span>
      </Link>
    </li>
  );
}

export function TenantIndex() {
  const { persona } = usePersona();
  const { cases, hydrated } = useStoreState();
  const { tenantById, leasesByTenant } = useLookups();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' });

  const rows = useMemo(
    () => buildTenantRows([...tenantById.values()], leasesByTenant, cases, persona),
    [tenantById, leasesByTenant, cases, persona],
  );
  const shown = useMemo(
    () => sortRows(filterRows(rows, query), sort.key, sort.dir),
    [rows, query, sort],
  );

  const choose = (key: SortKey, firstDir: SortDir) =>
    setSort((s) => ({ key, dir: s.key === key ? (s.dir === 'asc' ? 'desc' : 'asc') : firstDir }));

  return (
    <>
      <PageHeader
        title="Tenants"
        subtitle={hydrated ? `${plural(rows.length, 'tenant')} you can see` : undefined}
      />
      <Guard requires="view_case">
        {!hydrated ? (
          <LoadingState label="Loading tenants" />
        ) : rows.length === 0 ? (
          <EmptyState title="No tenants to show">
            There are no tenants with leases in your current view.
          </EmptyState>
        ) : (
          <section className="flex flex-col gap-4" aria-label="Tenant list">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-0 flex-1 basis-64 flex-col gap-1.5 text-sm font-medium">
                Search tenants
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tenant name"
                  className="h-10"
                />
              </label>
              <div role="group" aria-label="Sort by" className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Sort by</span>
                {SORTS.map(({ key, label, firstDir }) => {
                  const active = sort.key === key;
                  return (
                    <Button
                      key={key}
                      type="button"
                      variant={active ? 'secondary' : 'outline'}
                      className="h-10 px-3"
                      aria-pressed={active}
                      onClick={() => choose(key, firstDir)}
                    >
                      {label}
                      {active ? (
                        <span aria-hidden="true">{sort.dir === 'asc' ? ' ↑' : ' ↓'}</span>
                      ) : null}
                      {active ? (
                        <span className="sr-only">
                          {sort.dir === 'asc' ? ', ascending' : ', descending'}
                        </span>
                      ) : null}
                    </Button>
                  );
                })}
              </div>
            </div>

            {shown.length === 0 ? (
              <EmptyState title="No tenants match your search">
                Try a shorter name, or clear the search box.
              </EmptyState>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-card">
                <div
                  aria-hidden="true"
                  className="hidden grid-cols-[minmax(0,1fr)_6rem_7rem_8rem] gap-x-4 border-b bg-muted px-4 py-2 text-xs font-semibold text-gray-700 sm:grid"
                >
                  <span>Tenant</span>
                  <span>Leases</span>
                  <span>Open cases</span>
                  <span className="text-right">Total AR</span>
                </div>
                <ul className="divide-y" data-testid="tenant-list">
                  {shown.map((row) => (
                    <TenantListRow key={row.tenant.id} row={row} />
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </Guard>
    </>
  );
}
