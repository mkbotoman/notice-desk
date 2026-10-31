'use client';

import Link from 'next/link';
import { OwnerChip, StageChip } from '@/components/case/case-chips';
import { Chip, type ChipTone } from '@/components/ui/chip';
import { waitingOn } from '@/domain/stage';
import { STAGE_LABELS } from '@/lib/format';
import type { SignalKind } from '@/domain/watchlist';
import { useLookups } from '@/store/lookups';
import type { TroubledLease } from './inbox-logic';

const SIGNAL_TONES: Record<SignalKind, ChipTone> = {
  rent: 'danger',
  insurance: 'warning',
  listed: 'gray',
};

export function TroubleTable({ rows }: { rows: TroubledLease[] }) {
  const { tenantById, propertyById } = useLookups();
  return (
    <section aria-labelledby="in-trouble" className="overflow-x-auto rounded-xl border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 pb-2">
        <h2 id="in-trouble" className="text-base font-bold text-navy-deep">
          In trouble
        </h2>
        <span className="text-[13px] text-muted-foreground">
          Leases with an open case or a warning sign
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 pb-5 text-sm text-muted-foreground">
          No leases in view have an open case or a warning sign.
        </p>
      ) : (
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-surface text-left text-xs font-semibold text-gray-600">
              <th className="px-4 py-2.5">Tenant</th>
              <th className="px-4 py-2.5">Property</th>
              <th className="px-4 py-2.5">Why</th>
              <th className="px-4 py-2.5">Open case</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ lease, signals, openCase }) => {
              const property = lease.propertyId ? propertyById.get(lease.propertyId)?.name : null;
              return (
                <tr key={lease.id} className="border-b align-top last:border-b-0">
                  <td className="px-4 py-3 font-semibold">
                    {tenantById.get(lease.tenantId)?.displayName ?? 'Unknown tenant'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {property ?? 'Unknown property'}
                    {lease.suite ? ` · Ste ${lease.suite}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    {signals.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {signals.map((s) => (
                          <Chip key={`${s.kind}-${s.label}`} tone={SIGNAL_TONES[s.kind]}>
                            {s.label}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {openCase ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          href={`/cases/${encodeURIComponent(openCase.id)}`}
                          aria-label={`${STAGE_LABELS[openCase.stage]}, open case for ${tenantById.get(lease.tenantId)?.displayName ?? 'tenant'}`}
                        >
                          <StageChip stage={openCase.stage} />
                        </Link>
                        <OwnerChip owner={waitingOn(openCase)} />
                      </div>
                    ) : (
                      <span className="text-muted-foreground">No open case</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
