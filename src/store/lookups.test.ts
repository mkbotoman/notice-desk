import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Seed } from '@/domain/schemas';
import { readSeedDir } from '@/lib/seed';
import { buildLookups } from './lookups';

let seed: Seed;
beforeAll(async () => {
  seed = await readSeedDir(path.join(process.cwd(), 'data', 'seed', 'fixture'));
});

describe('buildLookups', () => {
  it('indexes reference data by id', () => {
    const l = buildLookups(seed);
    expect(l.propertyById.get('P-01')?.name).toBe('Harbor Commons');
    expect(l.leaseById.get('L-001')?.tenantId).toBe('T-01');
    expect(l.tenantById.get('T-01')?.displayName).toBe('Brightside Fitness LLC');
    expect(l.personById.get('PER-lena-park')?.name).toBe('Lena Park');
  });

  it('finds the COI that covers a lease, and none for a lease without one', () => {
    const l = buildLookups(seed);
    expect(l.coiByLeaseId.get('L-002')?.status).toBe('expired');
    expect(l.coiByLeaseId.get('nope')).toBeUndefined();
  });

  it('groups a tenant’s leases', () => {
    const l = buildLookups(seed);
    expect(l.leasesByTenant.get('T-01')?.map((x) => x.id)).toEqual(['L-001', 'L-002']);
  });
});
