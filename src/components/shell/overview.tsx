'use client';

import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import { addDaysISO } from '@/domain/dates';
import { DUE_SOON_DAYS, caseDeadline } from '@/domain/deadline';
import { casesInScope, openCases, waitingOnPersona } from '@/domain/selectors';
import type { Case } from '@/domain/types';
import { Stat } from '@/components/ui/stat';
import { useAsOf, usePersona } from '@/lib/persona/context';
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

  const open = openCases(casesInScope(cases, persona));
  const status = (c: Case) => caseDeadline(c, asOf).status;
  const overdue = open.filter((c) => status(c) === 'overdue');
  const dueSoon = open.filter((c) => status(c) === 'due_this_week');
  const waiting = waitingOnPersona(cases, persona);

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

  const team =
    persona.team === 'legal' ? 'Legal' : persona.team === 'asset_management' ? 'you' : null;
  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={`${open.length} open ${open.length === 1 ? 'case' : 'cases'} in view`}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          value={overdue.length}
          label="Overdue"
          tone="danger"
          detail="Cure deadline has passed"
        />
        <Stat
          value={dueSoon.length}
          label="Due this week"
          tone="warning"
          detail={`Through ${format(parseISO(addDaysISO(asOf, DUE_SOON_DAYS)), 'EEE, MMM d')}`}
        />
        <Stat value={open.length} label="Open cases" />
        {team ? (
          <Stat
            value={waiting.length}
            label={team === 'you' ? 'Waiting on you' : 'Waiting on Legal'}
          />
        ) : (
          <Stat value="—" label="Waiting on you" detail="This view has no cases of its own" />
        )}
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
                    <div className="font-semibold">{r.name}</div>
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
      <p className="text-sm text-muted-foreground">
        <Link href="/cases" className="font-semibold text-navy">
          Go to the case list
        </Link>
      </p>
    </>
  );
}
