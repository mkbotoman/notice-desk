'use client';

import { Guard } from '@/components/shell/guard';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, LoadingState } from '@/components/shell/states';
import { useAsOf, usePersona } from '@/lib/persona/context';
import { useLookups } from '@/store/lookups';
import { useStoreState } from '@/store/react';
import { groupWaiting, troubledLeases } from './inbox-logic';
import { TroubleTable } from './trouble-table';
import { WaitingRow } from './waiting-row';

function InboxBody() {
  const { persona } = usePersona();
  const { asOf } = useAsOf();
  const { cases, eventsByCase, hydrated } = useStoreState();
  const { coiByLeaseId, leaseById } = useLookups();

  if (!hydrated) return <LoadingState label="Loading your inbox" />;

  const groups = groupWaiting(cases, persona, asOf);
  const waitingCount = groups.reduce((n, g) => n + g.cases.length, 0);
  const trouble = troubledLeases([...leaseById.values()], cases, coiByLeaseId, persona, asOf);
  const forLegal = persona.team === 'legal';

  return (
    <>
      {persona.team === null ? (
        <EmptyState title="Nothing is waiting on you">
          Cases are handed to Legal or to asset managers. This view doesn&apos;t answer for either
          team, so nothing sits in its court. The leases below are still worth a look.
        </EmptyState>
      ) : groups.length === 0 ? (
        <EmptyState title={forLegal ? 'Nothing is waiting on Legal' : 'Nothing is waiting on you'}>
          {forLegal
            ? 'Every open case is with asset management or finished.'
            : 'No open case on your properties needs something from you right now.'}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`group-${g.key}`} className="flex flex-col gap-3">
              <h2
                id={`group-${g.key}`}
                className="text-xs font-bold tracking-wide text-gray-600 uppercase"
              >
                {g.label} · {g.cases.length}
              </h2>
              {g.cases.map((c) => (
                <WaitingRow key={c.id} c={c} events={eventsByCase.get(c.id)} />
              ))}
            </section>
          ))}
        </div>
      )}
      <TroubleTable rows={trouble} />
      <span data-testid="waiting-count" className="sr-only">
        {waitingCount}
      </span>
    </>
  );
}

export function Inbox() {
  const { persona } = usePersona();
  const first = persona.label.split(' ')[0];
  const title =
    persona.team === 'legal'
      ? 'Waiting on Legal'
      : persona.team
        ? `Waiting on you, ${first}`
        : 'Waiting on me';
  return (
    <>
      <PageHeader title={title} subtitle={<InboxSubtitle />} />
      <Guard requires="add_update">
        <InboxBody />
      </Guard>
    </>
  );
}

function InboxSubtitle() {
  const { persona } = usePersona();
  const { asOf } = useAsOf();
  const { cases, hydrated } = useStoreState();
  if (!hydrated || persona.team === null) return null;
  const n = groupWaiting(cases, persona, asOf).reduce((sum, g) => sum + g.cases.length, 0);
  const who = persona.team === 'legal' ? 'Legal' : 'you';
  return `${n} ${n === 1 ? 'case needs' : 'cases need'} something from ${who}`;
}
