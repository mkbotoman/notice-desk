'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { Case, Persona, Stage, Team } from '@/domain/types';
import { cn } from '@/lib/utils';
import { StageMovePanel } from '@/components/case/stage-move';
import { useCaseActions } from '@/store/use-case-actions';
import { ADVANCE_LABELS, ownerButtonLabel, teamName, type ActionAvailability } from './logic';

type Pending = { kind: 'advance'; to: Stage } | { kind: 'owner'; to: Team };

export const TEXTAREA_CLASS =
  'w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm';

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}

/** Header buttons plus the inline confirm step for stage and owner changes. */
export function CaseActions({
  c,
  persona,
  avail,
}: {
  c: Case;
  persona: Persona;
  avail: ActionAvailability;
}) {
  const actions = useCaseActions();
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hasControls = avail.draftNotification || avail.advanceTo.length > 0 || avail.ownerTo;
  if (!hasControls) return null;

  const choose = (next: Pending) => {
    setPending(next);
    setNote('');
    setError(null);
  };
  const cancel = () => {
    setPending(null);
    setError(null);
  };
  const confirm = () => {
    if (!pending) return;
    try {
      if (pending.kind === 'owner') actions.changeOwner(c.id, pending.to, note);
      setPending(null);
      setNote('');
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const confirmText = pending?.kind === 'owner' ? `Hand this case to ${teamName(pending.to)}?` : '';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" aria-label="Case actions" role="group">
        {avail.draftNotification ? (
          <Link
            href={`/outbox?compose=${encodeURIComponent(c.id)}`}
            className={cn(buttonVariants({ variant: 'outline' }), 'h-10 px-3.5')}
          >
            Draft a notification
          </Link>
        ) : null}
        {avail.ownerTo ? (
          <Button
            variant="outline"
            className="h-10 px-3.5"
            onClick={() => choose({ kind: 'owner', to: avail.ownerTo as Team })}
          >
            {ownerButtonLabel(persona, avail.ownerTo)}
          </Button>
        ) : null}
        {avail.advanceTo.map((to, i) => (
          <Button
            key={to}
            variant={i === avail.advanceTo.length - 1 ? 'default' : 'outline'}
            className="h-10 px-3.5"
            onClick={() => choose({ kind: 'advance', to })}
          >
            {ADVANCE_LABELS[to]}
          </Button>
        ))}
      </div>

      {pending?.kind === 'advance' ? (
        <StageMovePanel c={c} to={pending.to} onCancel={cancel} onDone={() => setPending(null)} />
      ) : null}

      {pending?.kind === 'owner' ? (
        <section
          aria-label="Confirm change"
          className="flex flex-col gap-3 rounded-xl border border-navy-line bg-navy-soft p-4"
        >
          <p className="text-sm font-semibold text-navy-deep">{confirmText}</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="change-note">Note (optional)</Label>
            <textarea
              id="change-note"
              rows={2}
              className={TEXTAREA_CLASS}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why? It is added to the case log."
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm font-semibold text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button className="h-10 px-3.5" onClick={confirm}>
              Confirm
            </Button>
            <Button variant="ghost" className="h-10 px-3.5" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
