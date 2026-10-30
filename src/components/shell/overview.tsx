'use client';

import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import { addDaysISO } from '@/domain/dates';
import { DUE_SOON_DAYS, caseDeadline } from '@/domain/deadline';
import { casesInScope, openCases } from '@/domain/selectors';
import { waitingOn } from '@/domain/stage';
import type { Case } from '@/domain/types';
import { Stat } from '@/components/ui/stat';
import { useAsOf, usePersona } from '@/lib/persona/context';
import { troubledLeases } from '@/components/inbox/inbox-logic';
import { TroubleTable } from '@/components/inbox/trouble-table';
import { useLookups } from '@/store/lookups';
import { useStore, useStoreState } from '@/store/react';
import { PageHeader } from './page-header';
import { EmptyState } from './states';

interface Row {
  key: string;
  name: string;
  place: string;
  open: number;
  overdue: number;
}

/** Home page for now: counts and a per-property rollup for whoever is being viewed. */
export function Overview() {
  const { persona } = usePersona();
  const { asOf } = useAsOf();
  const { cases } = useStoreState();
  const { properties } = useStore().getSeed();
  const { leaseById, coiByLeaseId } = useLookups();

  const open = openCases(casesInScope(cases, persona));
  const status = (c: Case) => caseDeadline(c, asOf).status;
  const overdue = open.filter((c) => status(c) === 'overdue');
  const dueSoon = open.filter((c) => status(c) === 'due_this_week');
  const withLegal = open.filter((c) => waitingOn(c) === 'legal').length;
  const withAssetMgmt = open.filter((c) => waitingOn(c) === 'asset_management').length;

  const rows: Row[] = properties
    .map((p) => {
      const here = open.filter((c) => c.propertyId === p.id);
      return {
        key: p.id,
        name: p.name,
        place: `${p.city}, ${p.state}`,
        open: here.length,
        overdue: here.filter((c) => status(c) === 'overdue').length,
      };
    })
    .filter((r) => r.open > 0)
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name));
  const elsewhere = open.filter((c) => c.propertyId === null);
  if (elsewhere.length > 0) {
    rows.push({
      key: 'unknown',
      name: 'Unknown property',
      place: 'Not matched to a property',
      open: elsewhere.length,
      overdue: elsewhere.filter((c) => status(c) === 'overdue').length,
    });
  }

  // Property managers have no inbox, so their home page carries the "In trouble" list.
  const trouble =
    persona.kind === 'property_manager'
      ? troubledLeases([...leaseById.values()], cases, coiByLeaseId, persona, asOf)
      : null;
  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={`${open.length} open ${open.length === 1 ? 'case' : 'cases'} in view`}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          value={overdue.length}
          label="Overdue"
          tone="danger"
          detail="Cure deadline has passed"
          href="/cases?due=overdue"
        />
        <Stat
          value={dueSoon.length}
          label="Due this week"
          tone="warning"
          detail={`Through ${format(parseISO(addDaysISO(asOf, DUE_SOON_DAYS)), 'EEE, MMM d')}`}
          href="/cases?due=week"
        />
        <Stat value={open.length} label="Open cases" href="/cases" />
        <Stat
          value={withLegal}
          label="Waiting on Legal"
          detail="Open cases in Legal's court"
          href="/cases?owner=legal"
        />
        <Stat
          value={withAssetMgmt}
          label="Waiting on Asset Mgmt"
          detail="Open cases in asset management's court"
          href="/cases?owner=asset_management"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No open cases in this view">
          Nothing is open for the properties this person looks after.
        </EmptyState>
      ) : (
        <section
          aria-labelledby="by-property"
          className="overflow-x-auto rounded-xl border bg-card"
        >
          <h2 id="by-property" className="px-4 pt-4 text-sm font-semibold text-navy-deep">
            Open cases by property
          </h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-surface text-left text-xs font-semibold text-gray-600">
                <th className="px-4 py-2.5">Property</th>
                <th className="px-4 py-2.5 text-right">Open</th>
                <th className="px-4 py-2.5 text-right">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b last:border-b-0">
                  <td className="px-4 py-3">
                    {r.key === 'unknown' ? (
                      <div className="font-semibold">{r.name}</div>
                    ) : (
                      <Link
                        href={`/cases?property=${encodeURIComponent(r.key)}`}
                        className="font-semibold text-navy hover:underline"
                      >
                        {r.name}
                      </Link>
                    )}
                    <div className="text-[13px] text-muted-foreground">{r.place}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.open}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.overdue > 0 ? (
                      <span className="font-semibold text-danger">{r.overdue}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {trouble ? <TroubleTable rows={trouble} /> : null}
      <p className="text-sm text-muted-foreground">
        <Link href="/cases" className="font-semibold text-navy">
          Go to the case list
        </Link>
      </p>
    </>
  );
}
