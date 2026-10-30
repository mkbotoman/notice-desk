'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAX_CURE_DAYS } from '@/domain/cure';
import { cureDeadlineDetail } from '@/domain/deadline';
import { allowedTransitions } from '@/domain/stage';
import type { Case, NoticeDetails, Stage } from '@/domain/types';
import { ADVANCE_LABELS, STAGE_LABELS, weekdayDate } from '@/lib/format';
import { isValidAsOf } from '@/lib/persona/asof';
import { useAsOf, usePersona } from '@/lib/persona/context';
import { can } from '@/domain/permissions';
import { useCaseActions } from '@/store/use-case-actions';

const FIELD =
  'w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm';

/** The moves this persona may make on the case right now. Empty for a read-only persona. */
export function useStageMoves(c: Case): readonly Stage[] {
  const { persona } = usePersona();
  return can(persona, 'advance_stage', c) ? allowedTransitions(c.stage) : [];
}

/** One button per move; `onChoose` opens the confirm panel for that stage. */
export function StageMoveButtons({
  c,
  onChoose,
  size = 'default',
}: {
  c: Case;
  onChoose: (to: Stage) => void;
  size?: 'default' | 'sm';
}) {
  const moves = useStageMoves(c);
  if (moves.length === 0) return null;
  return (
    <div role="group" aria-label={`Move case ${c.id}`} className="flex flex-wrap gap-2">
      {moves.map((to, i) => (
        <Button
          key={to}
          type="button"
          size={size}
          variant={i === moves.length - 1 ? 'default' : 'outline'}
          onClick={() => onChoose(to)}
        >
          {ADVANCE_LABELS[to]}
        </Button>
      ))}
    </div>
  );
}

/**
 * The confirm step for a stage move. A move to Notice to Cure also asks when the notice went out
 * and how long the tenant has to cure, and shows the deadline that will result: that is what
 * gives the case a deadline, a place in the overdue and due-this-week counts and its reminders.
 */
export function StageMovePanel({
  c,
  to,
  onCancel,
  onDone,
}: {
  c: Case;
  to: Stage;
  onCancel: () => void;
  onDone: () => void;
}) {
  const actions = useCaseActions();
  const { asOf } = useAsOf();
  const sendsNotice = to === 'notice_to_cure';
  const [note, setNote] = useState('');
  const [dateSent, setDateSent] = useState(asOf);
  const [noCure, setNoCure] = useState(false);
  const [days, setDays] = useState('10');
  const [unit, setUnit] = useState<'business' | 'calendar'>('business');
  const [error, setError] = useState<string | null>(null);

  const n = Number(days);
  const daysOk = Number.isInteger(n) && n >= 1 && n <= MAX_CURE_DAYS;
  const notice: NoticeDetails | null =
    !sendsNotice || !isValidAsOf(dateSent)
      ? null
      : noCure
        ? { dateSent, curePeriod: { kind: 'none' } }
        : daysOk
          ? { dateSent, curePeriod: { kind: 'days', n, unit } }
          : null;
  const preview = notice ? cureDeadlineDetail(notice.dateSent, notice.curePeriod) : null;
  const ready = !sendsNotice || notice !== null;

  const confirm = () => {
    try {
      actions.advance(c.id, to, note, notice ?? undefined);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  };

  return (
    <section
      aria-label="Confirm change"
      className="flex flex-col gap-3 rounded-xl border border-navy-line bg-navy-soft p-4"
    >
      <p className="text-sm font-semibold text-navy-deep">
        {sendsNotice
          ? 'Send the Notice to Cure'
          : `Move this case from ${STAGE_LABELS[c.stage]} to ${STAGE_LABELS[to]}?`}
      </p>

      {sendsNotice ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor={`sent-${c.id}`}>Date the notice was sent</Label>
            <Input
              id={`sent-${c.id}`}
              type="date"
              value={dateSent}
              onChange={(e) => setDateSent(e.target.value)}
            />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Cure period</legend>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Number of days"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_CURE_DAYS}
                className="w-24"
                disabled={noCure}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
              <select
                aria-label="Day type"
                disabled={noCure}
                value={unit}
                onChange={(e) => setUnit(e.target.value as 'business' | 'calendar')}
                className="min-h-10 rounded-lg border border-input bg-card px-3 text-sm disabled:opacity-50"
              >
                <option value="business">business days</option>
                <option value="calendar">calendar days</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={noCure}
                onChange={(e) => setNoCure(e.target.checked)}
              />
              No cure date
            </label>
          </fieldset>
          <p className="text-sm" aria-live="polite" data-testid="deadline-preview">
            {!isValidAsOf(dateSent)
              ? 'Enter the date the notice was sent.'
              : !noCure && !daysOk
                ? `Enter a whole number of days from 1 to ${MAX_CURE_DAYS}.`
                : preview
                  ? `The cure deadline will be ${weekdayDate(preview.deadline)}${
                      preview.skippedHolidays.length > 0
                        ? `, skipping ${preview.skippedHolidays.map((h) => h.name).join(' and ')}`
                        : ''
                    }.`
                  : 'No deadline will be set.'}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`note-${c.id}-${to}`}>Note (optional)</Label>
        <textarea
          id={`note-${c.id}-${to}`}
          rows={2}
          className={FIELD}
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
        <Button type="button" disabled={!ready} onClick={confirm}>
          {sendsNotice ? 'Send notice' : 'Confirm'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
