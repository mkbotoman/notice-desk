'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { DeadlineChip, StageChip } from '@/components/case/case-chips';
import { StageMovePanel, useStageMoves } from '@/components/case/stage-move';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { caseDeadline } from '@/domain/deadline';
import { can } from '@/domain/permissions';
import type { Case, CaseEvent, ISODate, Stage } from '@/domain/types';
import { ADVANCE_LABELS, ISSUE_LABELS, STAGE_LABELS, shortDate } from '@/lib/format';
import { useAsOf, usePersona } from '@/lib/persona/context';
import { useLookups } from '@/store/lookups';
import { useCaseActions } from '@/store/use-case-actions';
import { isValidAsOf } from '@/lib/persona/asof';

type Panel = 'update' | 'handback' | 'move' | null;

const textareaClass =
  'min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm';

/** The newest event that carries words: an update, an import note, or a hand-over note. */
function lastNote(events: readonly CaseEvent[] | undefined): CaseEvent | undefined {
  return events
    ?.filter((e) => e.note)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.at.localeCompare(b.at))
    .at(-1);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

export function WaitingRow({ c, events }: { c: Case; events: readonly CaseEvent[] | undefined }) {
  const { persona } = usePersona();
  const { asOf } = useAsOf();
  const { tenantById, propertyById, leaseById } = useLookups();
  const actions = useCaseActions();
  const [panel, setPanel] = useState<Panel>(null);
  const [text, setText] = useState('');
  const [date, setDate] = useState<ISODate>(asOf);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<Stage | null>(null);
  const moves = useStageMoves(c);
  const id = useId();

  const tenant = tenantById.get(c.tenantId)?.displayName ?? 'Unknown tenant';
  const property = c.propertyId ? propertyById.get(c.propertyId)?.name : undefined;
  const suite = c.leaseId ? leaseById.get(c.leaseId)?.suite : null;
  const place = [property ?? 'Unknown property', suite ? `Ste ${suite}` : null]
    .filter(Boolean)
    .join(' · ');
  const latest = lastNote(events);
  const canUpdate = can(persona, 'add_update', c);
  // Legal already holds these cases, so handing one "back to Legal" only applies to the other team.
  const canHandBack = c.owner !== 'legal' && can(persona, 'change_owner', c);

  const open = (next: Exclude<Panel, null>) => {
    setError(null);
    setDone(null);
    setDate(asOf);
    setPanel(panel === next ? null : next);
  };

  const run = (fn: () => void, message: string) => {
    try {
      fn();
      setError(null);
      setPanel(null);
      setText('');
      setNote('');
      setDone(message);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 basis-80 flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Link
              href={`/cases/${encodeURIComponent(c.id)}`}
              className="text-base font-bold text-navy hover:text-navy-deep"
            >
              {tenant}
            </Link>
            <span className="text-[13px] text-muted-foreground">{place}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <DeadlineChip deadline={caseDeadline(c, asOf)} />
            <StageChip stage={c.stage} />
            <Chip tone="outline">{ISSUE_LABELS[c.issueType]}</Chip>
            {c.workflowStatus ? <Chip tone="gray">{c.workflowStatus}</Chip> : null}
          </div>
          {latest ? (
            <div className="rounded-lg bg-background px-3 py-2.5">
              <div className="text-xs font-semibold text-muted-foreground">
                Latest note · {shortDate(latest.effectiveDate)}
              </div>
              <p className="mt-0.5 line-clamp-3 text-sm leading-relaxed">{latest.note}</p>
            </div>
          ) : null}
          {done ? (
            <p role="status" className="text-sm font-medium text-success">
              {done}
            </p>
          ) : null}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-48">
          {canUpdate ? (
            <Button
              type="button"
              size="lg"
              aria-expanded={panel === 'update'}
              onClick={() => open('update')}
            >
              Add update
            </Button>
          ) : null}
          {canHandBack ? (
            <Button
              type="button"
              size="lg"
              variant="outline"
              aria-expanded={panel === 'handback'}
              onClick={() => open('handback')}
            >
              Hand back to Legal
            </Button>
          ) : null}
          {moves.map((to) => (
            <Button
              key={to}
              type="button"
              size="lg"
              variant="outline"
              aria-expanded={panel === 'move' && moveTo === to}
              onClick={() => {
                setError(null);
                setDone(null);
                setMoveTo(to);
                setPanel('move');
              }}
            >
              {ADVANCE_LABELS[to]}
            </Button>
          ))}
        </div>
      </div>

      {panel === 'update' ? (
        <form
          className="flex flex-col gap-3 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => actions.addUpdate(c.id, text, date), 'Update added');
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor={`${id}-text`}>
            What happened?
            <textarea
              id={`${id}-text`}
              className={textareaClass}
              value={text}
              required
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <label
            className="flex flex-col gap-1.5 text-sm font-medium sm:w-48"
            htmlFor={`${id}-date`}
          >
            Date
            <Input
              id={`${id}-date`}
              type="date"
              value={date}
              required
              onChange={(e) => isValidAsOf(e.target.value) && setDate(e.target.value)}
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="lg">
              Save update
            </Button>
            <Button type="button" size="lg" variant="ghost" onClick={() => setPanel(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {panel === 'handback' ? (
        <form
          className="flex flex-col gap-3 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => actions.changeOwner(c.id, 'legal', note), 'Handed back to Legal');
          }}
        >
          <p className="text-sm">
            Hand <strong>{tenant}</strong> back to Legal? It will leave your list.
          </p>
          <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor={`${id}-note`}>
            Note for Legal (optional)
            <Input id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="lg">
              Confirm hand back
            </Button>
            <Button type="button" size="lg" variant="ghost" onClick={() => setPanel(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {panel === 'move' && moveTo ? (
        <StageMovePanel
          c={c}
          to={moveTo}
          onCancel={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            setDone(`Moved to ${STAGE_LABELS[moveTo]}.`);
          }}
        />
      ) : null}
    </article>
  );
}
