'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Case, CaseEvent, Persona } from '@/domain/types';
import { shortDate } from '@/lib/format';
import { useAsOf } from '@/lib/persona/context';
import { useCaseActions } from '@/store/use-case-actions';
import { TEXTAREA_CLASS, errorMessage } from './case-actions';
import { actorLabel, describeEvent, newestFirst } from './logic';

function AddUpdate({ caseId }: { caseId: string }) {
  const actions = useCaseActions();
  const { asOf } = useAsOf();
  const [text, setText] = useState('');
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      actions.addUpdate(caseId, text, dateOverride || asOf);
      setText('');
      setDateOverride(null);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5 rounded-xl border bg-surface p-3.5">
      <Label htmlFor="update-text">Add an update</Label>
      <textarea
        id="update-text"
        rows={3}
        className={TEXTAREA_CLASS}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What happened? e.g. Tenant called, promised payment by Nov 15"
      />
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <Label htmlFor="update-date" className="text-muted-foreground">
          Date
          <Input
            id="update-date"
            type="date"
            className="w-auto"
            value={dateOverride ?? asOf}
            onChange={(e) => setDateOverride(e.target.value)}
          />
        </Label>
        <Button type="submit" className="h-10 px-3.5">
          Add update
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function Activity({
  c,
  events,
  personas,
  canAddUpdate,
}: {
  c: Case;
  events: readonly CaseEvent[];
  personas: readonly Persona[];
  canAddUpdate: boolean;
}) {
  const sorted = newestFirst(events);
  return (
    <section aria-label="Activity" className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <h2 className="text-base font-bold text-navy-deep">Activity</h2>
      {canAddUpdate ? <AddUpdate caseId={c.id} /> : null}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing has been logged on this case yet.</p>
      ) : (
        <ol aria-label="Case log" className="flex flex-col">
          {sorted.map((event) => {
            const view = describeEvent(event);
            return (
              <li key={event.id} className="flex gap-3.5 border-b py-3 last:border-b-0">
                <time
                  dateTime={view.date}
                  className="w-14 flex-none text-[13px] font-semibold text-gray-700 tabular-nums"
                >
                  {shortDate(view.date)}
                </time>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={view.tone}>{view.kind}</Chip>
                    <span className="text-[13px] text-muted-foreground">
                      {actorLabel(event.actorPersonaId, personas)}
                    </span>
                  </div>
                  {view.summary ? <p className="text-sm">{view.summary}</p> : null}
                  {view.note ? (
                    <p className="text-sm leading-normal break-words whitespace-pre-wrap">
                      {view.note}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
