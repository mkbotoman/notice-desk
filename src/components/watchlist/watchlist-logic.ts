import { worseAging } from '@/domain/aging';
import { can, inScope } from '@/domain/permissions';
import { openCases } from '@/domain/selectors';
import {
  leaseSignals,
  looksNonCompliant,
  type LeaseSignal,
  type SignalKind,
} from '@/domain/watchlist';
import type { ArAging, Case, CoiRecord, ISODate, Lease, Persona } from '@/domain/types';
import { UNKNOWN_PROPERTY } from '@/components/case-list/filters';

export interface WatchlistRow {
  lease: Lease;
  signals: LeaseSignal[];
  /** True when the lease is a breach (rent or insurance), not only a listed risk. */
  breach: boolean;
  /** Set when the recorded aging and the one the balance implies disagree. */
  agingGap: { recorded: ArAging; implied: ArAging } | null;
}

export interface WatchlistFilters {
  signal: SignalKind | null;
  /** A property id, or UNKNOWN_PROPERTY. Null means every property. */
  property: string | null;
}

export const NO_WATCH_FILTERS: WatchlistFilters = { signal: null, property: null };

export const hasWatchFilters = (f: WatchlistFilters) => f.signal !== null || f.property !== null;

const AGING_ORDER: readonly ArAging[] = ['current', '1_30', '31_60', '61_90', '90_plus'];
const agingRank = (a: ArAging | null) => (a === null ? -1 : AGING_ORDER.indexOf(a));

/**
 * Leases in the persona's scope with no open case and at least one signal, most severe first:
 * breaches before listed risks, then more signals, then worse aging (recorded or implied).
 * A lease with no property is in scope only for personas who see every property.
 */
export function buildWatchlist(
  leases: readonly Lease[],
  cases: readonly Case[],
  coiByLeaseId: ReadonlyMap<string, CoiRecord>,
  persona: Persona,
  asOf: ISODate,
): WatchlistRow[] {
  if (!can(persona, 'view_analytics')) return [];
  const withOpenCase = new Set(openCases(cases).map((c) => c.leaseId));
  const rows: WatchlistRow[] = [];
  for (const lease of leases) {
    if (!inScope(persona, lease.propertyId) || withOpenCase.has(lease.id)) continue;
    const signals = leaseSignals(lease, coiByLeaseId.get(lease.id), asOf);
    if (signals.length === 0) continue;
    const gap = signals.some((s) => s.agingDisagrees) && lease.arAgingImplied !== null;
    rows.push({
      lease,
      signals,
      breach: looksNonCompliant(signals),
      agingGap: gap
        ? { recorded: lease.arAgingRecorded, implied: lease.arAgingImplied as ArAging }
        : null,
    });
  }
  const rank = (r: WatchlistRow) =>
    agingRank(worseAging(r.lease.arAgingRecorded, r.lease.arAgingImplied));
  return rows.sort(
    (a, b) =>
      Number(b.breach) - Number(a.breach) ||
      b.signals.length - a.signals.length ||
      rank(b) - rank(a) ||
      a.lease.id.localeCompare(b.lease.id),
  );
}

export function filterWatchlist(
  rows: readonly WatchlistRow[],
  filters: WatchlistFilters,
): WatchlistRow[] {
  return rows.filter(
    (r) =>
      (filters.signal === null || r.signals.some((s) => s.kind === filters.signal)) &&
      (filters.property === null || (r.lease.propertyId ?? UNKNOWN_PROPERTY) === filters.property),
  );
}

export function splitWatchlist(rows: readonly WatchlistRow[]) {
  return {
    breaches: rows.filter((r) => r.breach),
    listed: rows.filter((r) => !r.breach),
  };
}
