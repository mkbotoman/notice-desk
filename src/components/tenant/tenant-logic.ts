import { format, parseISO } from 'date-fns';
import { AR_AGING_LABELS, worseAging } from '@/domain/aging';
import { effectiveCoiStatus } from '@/domain/coi';
import { can, inScope } from '@/domain/permissions';
import { isTerminal } from '@/domain/stage';
import type {
  Case,
  CaseEvent,
  CoiRecord,
  ISODate,
  Lease,
  Persona,
  Property,
  Tenant,
} from '@/domain/types';
import type { ChipTone } from '@/components/ui/chip';
import { STAGE_LABELS, TEAM_LABELS } from '@/lib/format';

export interface TenantRow {
  tenant: Tenant;
  /** Only the leases the persona may see. */
  leases: Lease[];
  openCases: number;
  /** Sum of live balances on those leases. A lease with no balance counts as zero. */
  totalAr: number;
}

export type SortKey = 'name' | 'cases' | 'ar';
export type SortDir = 'asc' | 'desc';

/** Leases in the persona's scope; one with no property is visible to all-property personas only. */
export function leasesInScope(leases: readonly Lease[], persona: Persona): Lease[] {
  return leases.filter((l) => inScope(persona, l.propertyId));
}

/** One row per tenant with at least one lease in scope; counts use only what the persona can see. */
export function buildTenantRows(
  tenants: readonly Tenant[],
  leasesByTenant: ReadonlyMap<string, Lease[]>,
  cases: readonly Case[],
  persona: Persona,
): TenantRow[] {
  const openByTenant = new Map<string, number>();
  for (const c of cases) {
    if (isTerminal(c.stage) || !can(persona, 'view_case', c)) continue;
    openByTenant.set(c.tenantId, (openByTenant.get(c.tenantId) ?? 0) + 1);
  }
  return tenants.flatMap((tenant) => {
    const leases = leasesInScope(leasesByTenant.get(tenant.id) ?? [], persona);
    if (leases.length === 0) return [];
    return [
      {
        tenant,
        leases,
        openCases: openByTenant.get(tenant.id) ?? 0,
        totalAr: leases.reduce((sum, l) => sum + (l.arBalance ?? 0), 0),
      },
    ];
  });
}

/** Matches the tenant name or any other spelling of it, ignoring case and extra spaces. */
export function filterRows(rows: readonly TenantRow[], query: string): TenantRow[] {
  const needle = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!needle) return [...rows];
  return rows.filter(({ tenant }) =>
    [tenant.displayName, ...tenant.nameVariants].some((n) => n.toLowerCase().includes(needle)),
  );
}

/** Ties fall back to name, so the order is stable whichever column is sorted. */
export function sortRows(rows: readonly TenantRow[], key: SortKey, dir: SortDir): TenantRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  const byName = (a: TenantRow, b: TenantRow) =>
    a.tenant.displayName.localeCompare(b.tenant.displayName);
  const primary = (a: TenantRow, b: TenantRow) => {
    if (key === 'name') return sign * byName(a, b);
    if (key === 'cases') return sign * (a.openCases - b.openCases);
    return sign * (a.totalAr - b.totalAr);
  };
  return [...rows].sort((a, b) => primary(a, b) || byName(a, b));
}

export interface AgingText {
  text: string;
  /** True when the balance proves the recorded aging is too low. */
  understated: boolean;
}

/** "Recorded 1–30 days · balance implies 61–90 days" when the two differ. */
export function agingText(lease: Pick<Lease, 'arAgingRecorded' | 'arAgingImplied'>): AgingText {
  const { arAgingRecorded: recorded, arAgingImplied: implied } = lease;
  const recordedText =
    recorded === 'unknown' ? 'Recorded aging unknown' : `Recorded ${AR_AGING_LABELS[recorded]}`;
  if (implied === null) return { text: recordedText, understated: false };
  if (implied === recorded) return { text: `${recordedText} · balance agrees`, understated: false };
  return {
    text: `${recordedText} · balance implies ${AR_AGING_LABELS[implied]}`,
    understated: recorded !== 'unknown' && worseAging(recorded, implied) === implied,
  };
}

export interface CoiDisplay {
  label: string;
  tone: ChipTone;
}

const dateText = (iso: ISODate) => format(parseISO(iso), 'MMM d, yyyy');

/** A lease with no record, or a synthesized `missing` one, has no certificate on file. */
export function coiDisplay(record: CoiRecord | undefined, asOf: ISODate): CoiDisplay {
  if (!record || record.status === 'missing') return { label: 'No COI on file', tone: 'danger' };
  const on = record.expiresOn;
  switch (effectiveCoiStatus(record, asOf)) {
    case 'valid':
      return { label: on ? `Valid until ${dateText(on)}` : 'Valid', tone: 'success' };
    case 'expiring':
      return { label: on ? `Expires ${dateText(on)}` : 'Expiring', tone: 'warning' };
    case 'expired':
      return { label: on ? `Expired ${dateText(on)}` : 'Expired', tone: 'danger' };
    case 'non_compliant':
      return { label: 'Non-compliant', tone: 'danger' };
    default:
      return { label: 'Status unknown', tone: 'gray' };
  }
}

/** The lease's current case: its open case, newest first if the data ever holds two. */
export function openCaseForLease(cases: readonly Case[], leaseId: string): Case | undefined {
  return cases
    .filter((c) => c.leaseId === leaseId && !isTerminal(c.stage))
    .sort(
      (a, b) => (b.dateSent ?? '').localeCompare(a.dateSent ?? '') || a.id.localeCompare(b.id),
    )[0];
}

export function propertyLine(property: Property | undefined): string {
  return property ? `${property.name}, ${property.city}` : 'Property not on file';
}

export interface TimelineEntry {
  id: string;
  caseId: string;
  date: ISODate;
  summary: string;
  /** Free text from a person; callers render it as text only. */
  note: string | null;
  actor: string;
}

function describeEvent(event: CaseEvent): string | null {
  switch (event.type) {
    case 'case_opened':
      return 'Case opened';
    case 'imported_note':
      return 'Imported note';
    case 'note':
      return 'Note added';
    case 'stage_changed':
      return `Stage changed from ${STAGE_LABELS[event.payload.from]} to ${STAGE_LABELS[event.payload.to]}`;
    case 'owner_changed':
      return `Owner changed from ${TEAM_LABELS[event.payload.from]} to ${TEAM_LABELS[event.payload.to]}`;
    default:
      return null;
  }
}

/** Case, note, stage and owner events across the given cases, newest first. */
export function buildTimeline(
  tenantCases: readonly Case[],
  eventsByCase: ReadonlyMap<string, CaseEvent[]>,
  actorLabel: (actorPersonaId: string) => string,
): TimelineEntry[] {
  const described = tenantCases.flatMap((c) =>
    (eventsByCase.get(c.id) ?? []).flatMap((event) => {
      const summary = describeEvent(event);
      return summary === null ? [] : [{ event, summary }];
    }),
  );
  described.sort(
    (a, b) =>
      b.event.effectiveDate.localeCompare(a.event.effectiveDate) ||
      b.event.at.localeCompare(a.event.at) ||
      a.event.id.localeCompare(b.event.id),
  );
  return described.map(({ event, summary }) => ({
    id: event.id,
    caseId: event.caseId,
    date: event.effectiveDate,
    summary,
    note: event.note?.trim() ? event.note : null,
    actor: actorLabel(event.actorPersonaId),
  }));
}

export function actorLabeller(personas: readonly Persona[]) {
  return (id: string) =>
    id === 'import'
      ? 'Imported from Legal’s sheet'
      : (personas.find((p) => p.id === id)?.label ?? 'Unknown');
}
