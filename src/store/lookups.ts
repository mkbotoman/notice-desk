import { useMemo } from 'react';
import type { Seed } from '@/domain/schemas';
import type { CoiRecord, Lease, Person, Property, Tenant } from '@/domain/types';
import { useStore } from './react';

/** Reference data by id. The seed never changes, so these are built once per seed. */
export interface Lookups {
  propertyById: ReadonlyMap<string, Property>;
  leaseById: ReadonlyMap<string, Lease>;
  tenantById: ReadonlyMap<string, Tenant>;
  personById: ReadonlyMap<string, Person>;
  /** The COI record that covers a lease, if the insurance tool had one. */
  coiByLeaseId: ReadonlyMap<string, CoiRecord>;
  leasesByTenant: ReadonlyMap<string, Lease[]>;
}

export function buildLookups(seed: Seed): Lookups {
  const coiByLeaseId = new Map<string, CoiRecord>();
  for (const record of seed.coi) {
    for (const leaseId of record.leaseIds) coiByLeaseId.set(leaseId, record);
  }
  const leasesByTenant = new Map<string, Lease[]>();
  for (const lease of seed.leases) {
    leasesByTenant.set(lease.tenantId, [...(leasesByTenant.get(lease.tenantId) ?? []), lease]);
  }
  return {
    propertyById: new Map(seed.properties.map((p) => [p.id, p])),
    leaseById: new Map(seed.leases.map((l) => [l.id, l])),
    tenantById: new Map(seed.tenants.map((t) => [t.id, t])),
    personById: new Map(seed.people.map((p) => [p.id, p])),
    coiByLeaseId,
    leasesByTenant,
  };
}

export function useLookups(): Lookups {
  const store = useStore();
  return useMemo(() => buildLookups(store.getSeed()), [store]);
}
