import { isTerminal } from '../stage';
import type { Case, Lease } from '../types';

export interface TenantCaseRow {
  tenantId: string;
  name: string;
  cases: number;
  open: number;
}

export interface TenantArRow {
  tenantId: string;
  name: string;
  ar: number;
  leases: number;
}

export interface RepeatTenantRow extends TenantCaseRow {
  leasesAffected: number;
  /** Live balance across the tenant's leases in the persona's scope. */
  ar: number;
}

export interface Ranked<T> {
  rows: T[];
  /** Rows before the limit was applied. */
  total: number;
}

type NameOf = (tenantId: string) => string;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

function caseRows(cases: readonly Case[], nameOf: NameOf): TenantCaseRow[] {
  const rows = new Map<string, TenantCaseRow>();
  for (const c of cases) {
    const row = rows.get(c.tenantId) ?? {
      tenantId: c.tenantId,
      name: nameOf(c.tenantId),
      cases: 0,
      open: 0,
    };
    row.cases += 1;
    if (!isTerminal(c.stage)) row.open += 1;
    rows.set(c.tenantId, row);
  }
  return [...rows.values()];
}

function arByTenant(leases: readonly Lease[]) {
  const ar = new Map<string, { ar: number; leases: number }>();
  for (const l of leases) {
    const row = ar.get(l.tenantId) ?? { ar: 0, leases: 0 };
    row.ar += l.arBalance ?? 0;
    row.leases += 1;
    ar.set(l.tenantId, row);
  }
  return ar;
}

/** Most cases first, closed ones included. */
export function topTenantsByCases(
  cases: readonly Case[],
  nameOf: NameOf,
  limit: number,
): Ranked<TenantCaseRow> {
  const rows = caseRows(cases, nameOf).sort((a, b) => b.cases - a.cases || byName(a, b));
  return { rows: rows.slice(0, limit), total: rows.length };
}

/** Largest live balance first. Tenants owing nothing, or in credit, are left out. */
export function topTenantsByAr(
  leases: readonly Lease[],
  nameOf: NameOf,
  limit: number,
): Ranked<TenantArRow> {
  const rows = [...arByTenant(leases)]
    .map(([tenantId, v]) => ({ tenantId, name: nameOf(tenantId), ...v }))
    .filter((r) => r.ar > 0)
    .sort((a, b) => b.ar - a.ar || byName(a, b));
  return { rows: rows.slice(0, limit), total: rows.length };
}

/** Tenants with two or more cases, in any stage. */
export function repeatTenants(
  cases: readonly Case[],
  leases: readonly Lease[],
  nameOf: NameOf,
  limit: number,
): Ranked<RepeatTenantRow> {
  const ar = arByTenant(leases);
  const leaseIds = new Map<string, Set<string>>();
  for (const c of cases) {
    if (c.leaseId === null) continue;
    leaseIds.set(c.tenantId, (leaseIds.get(c.tenantId) ?? new Set()).add(c.leaseId));
  }
  const rows = caseRows(cases, nameOf)
    .filter((r) => r.cases >= 2)
    .map((r) => ({
      ...r,
      leasesAffected: leaseIds.get(r.tenantId)?.size ?? 0,
      ar: ar.get(r.tenantId)?.ar ?? 0,
    }))
    .sort((a, b) => b.cases - a.cases || b.ar - a.ar || byName(a, b));
  return { rows: rows.slice(0, limit), total: rows.length };
}
