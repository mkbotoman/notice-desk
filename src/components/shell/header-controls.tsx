'use client';

import { useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { isValidAsOf, todayISO } from '@/lib/persona/asof';
import { useAsOf, useIsClient, usePersona } from '@/lib/persona/context';
import { describePersona, personaOptionLabel } from '@/lib/persona/personas';

const pretty = (iso: string) => format(parseISO(iso), 'EEE, MMM d, yyyy');

/** The "as of" chip. Every date badge in the app reads this date. */
export function AsOfControl() {
  const { asOf, dataDate, isDataDate, setAsOf, resetToDataDate, jumpToToday } = useAsOf();
  // The real date differs between the build and the browser, so only the browser may print it.
  const isClient = useIsClient();
  const details = useRef<HTMLDetailsElement>(null);
  const close = () => details.current?.removeAttribute('open');

  return (
    <details ref={details} className="group relative">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-input bg-card px-3 text-sm font-medium text-gray-700 hover:bg-navy-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <span>As of {pretty(asOf)}</span>
        {isDataDate ? null : <Chip tone="warning">Changed</Chip>}
      </summary>
      <div className="absolute right-0 z-20 mt-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-xl border bg-card p-4 shadow-lg">
        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="as-of-date">
          Show the app as of
          <Input
            id="as-of-date"
            type="date"
            value={asOf}
            onChange={(e) => isValidAsOf(e.target.value) && setAsOf(e.target.value)}
          />
        </label>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isDataDate}
            onClick={() => {
              resetToDataDate();
              close();
            }}
          >
            Data date ({format(parseISO(dataDate), 'MMM d')})
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={asOf === todayISO()}
            onClick={() => {
              jumpToToday();
              close();
            }}
          >
            Today{isClient ? ` (${format(new Date(), 'MMM d')})` : ''}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          The data was exported on {pretty(dataDate)}. Deadlines and badges are worked out against
          the date shown here.
        </p>
      </div>
    </details>
  );
}

export function PersonaSwitcher() {
  const { persona, personas, setPersonaId } = usePersona();
  return (
    <label className="flex items-center gap-2 text-[13px] text-gray-600">
      Viewing as
      <select
        value={persona.id}
        onChange={(e) => setPersonaId(e.target.value)}
        className="min-h-10 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {personas.map((p) => (
          <option key={p.id} value={p.id}>
            {personaOptionLabel(p)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Always visible: who the app is showing, and what they may do. */
export function PersonaChip() {
  const { persona } = usePersona();
  return (
    <Chip tone="navy" data-testid="persona-chip">
      Viewing as {describePersona(persona)}
    </Chip>
  );
}

export function HeaderControls() {
  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <div className="flex flex-wrap items-center gap-2.5">
        <AsOfControl />
        <PersonaSwitcher />
      </div>
      <PersonaChip />
    </div>
  );
}
