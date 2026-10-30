'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Chip, type ChipTone } from '@/components/ui/chip';
import { coiDisplay } from '@/components/tenant/tenant-logic';
import { AR_AGING_LABELS } from '@/domain/aging';
import type { CoiRecord, ISODate } from '@/domain/types';
import type { SignalKind } from '@/domain/watchlist';
import { formatCents } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { WatchlistRow as Row } from './watchlist-logic';

const SIGNAL_TONES: Record<SignalKind, ChipTone> = {
  rent: 'danger',
  insurance: 'warning',
  listed: 'gray',
};

export function WatchlistRow({
  row,
  tenantName,
  place,
  coi,
  asOf,
  quiet,
  onOpenCase,
}: {
  row: Row;
  tenantName: string;
  place: string;
  coi: CoiRecord | undefined;
  asOf: ISODate;
  /** Listed risks are shown more quietly than breaches. */
  quiet: boolean;
  /** Null for personas who may not open cases. */
  onOpenCase: (() => void) | null;
}) {
  const { lease, signals, agingGap } = row;
  const insurance = coiDisplay(coi, asOf);
  return (
    <li
      data-lease={lease.id}
      className={cn(
        'grid gap-x-4 gap-y-3 border-t px-4 py-4 first:border-t-0 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-start',
        quiet && 'bg-surface',
      )}
    >
      <div className="flex flex-col gap-0.5">
        <Link
          href={`/tenants/${encodeURIComponent(lease.tenantId)}`}
          className="font-semibold text-navy underline-offset-2 hover:underline"
        >
          {tenantName}
        </Link>
        <span className="text-[13px] text-gray-700">{place}</span>
        <span className="font-mono text-xs text-muted-foreground">{lease.id}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <ul aria-label="Why it is here" className="flex flex-wrap gap-1.5">
          {signals.map((s, n) => (
            <li key={`${s.kind}-${n}`}>
              <Chip tone={SIGNAL_TONES[s.kind]}>{s.label}</Chip>
            </li>
          ))}
        </ul>
        {agingGap ? (
          <p className="text-xs text-gray-700">
            Recorded aging is {AR_AGING_LABELS[agingGap.recorded]}, but the balance implies{' '}
            {AR_AGING_LABELS[agingGap.implied]}. The worse of the two is used.
          </p>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm md:grid-cols-1">
        <div className="flex flex-col">
          <dt className="text-xs text-muted-foreground">AR balance</dt>
          <dd className="font-semibold tabular-nums">{formatCents(lease.arBalance)}</dd>
        </div>
        <div className="flex flex-col items-start">
          <dt className="text-xs text-muted-foreground">Insurance</dt>
          <dd>
            <Chip tone={insurance.tone}>{insurance.label}</Chip>
          </dd>
        </div>
      </dl>

      {onOpenCase ? (
        <div className="md:justify-self-end">
          <Button onClick={onOpenCase} aria-label={`Open case for ${tenantName}, ${place}`}>
            Open case
          </Button>
        </div>
      ) : null}
    </li>
  );
}
