'use client';

import { Guard } from '@/components/shell/guard';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, LoadingState } from '@/components/shell/states';
import type { Persona } from '@/domain/types';
import { useAsOf, usePersona } from '@/lib/persona/context';
import { useLookups } from '@/store/lookups';
import { useStoreState } from '@/store/react';
import { groupWaiting, troubledLeases } from './inbox-logic';
import { TroubleTable } from './trouble-table';
import { WaitingRow } from './waiting-row';

function emptyCopy(persona: Persona): { title: string; body: string } {
  if (persona.kind === 'founder') {
    return { title: 'Nothing is open', body: 'Every case is cured or closed.' };
  }
  if (persona.team === 'legal') {
    return {
      title: 'Nothing is waiting on Legal',
      body: 'Every open case is with asset management or finished.',
    };
  }
  return {
    title: 'Nothing is waiting on you',
    body: 'No open case on your properties needs something from you right now.',
  };
}

function InboxBody() {
  const { persona } = usePersona();
  const { asOf } = useAsOf();
  const { cases, eventsByCase, hydrated } = useStoreState();
  const { coiByLeaseId, leaseById } = useLookups();

  if (!hydrated) return <LoadingState label="Loading your inbox" />;

  const groups = groupWaiting(cases, persona, asOf);
  const waitingCount = groups.reduce((n, g) => n + g.cases.length, 0);
  const trouble = troubledLeases([...leaseById.values()], cases, coiByLeaseId, persona, asOf);
  const empty = emptyCopy(persona);

  return (
    <>
      {groups.length === 0 ? (
        <EmptyState title={empty.title}>{empty.body}</EmptyState>
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
    persona.kind === 'founder'
      ? 'Waiting across the portfolio'
      : persona.team === 'legal'
        ? 'Waiting on Legal'
        : `Waiting on you, ${first}`;
  return (
    <>
      <PageHeader title={title} subtitle={<InboxSubtitle />} />
      <Guard requires="view_inbox">
        <InboxBody />
      </Guard>
    </>
  );
}

function InboxSubtitle() {
  const { persona } = usePersona();
  const { asOf } = useAsOf();
  const { cases, hydrated } = useStoreState();
  if (!hydrated) return null;
  const n = groupWaiting(cases, persona, asOf).reduce((sum, g) => sum + g.cases.length, 0);
  if (persona.kind === 'founder')
    return `${n} open ${n === 1 ? 'case' : 'cases'} with Legal or asset management`;
  const who = persona.team === 'legal' ? 'Legal' : 'you';
  return `${n} ${n === 1 ? 'case needs' : 'cases need'} something from ${who}`;
}
