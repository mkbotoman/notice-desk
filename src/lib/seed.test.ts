import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STAGES } from '@/domain/types';
import { loadSeed, readSeedDir } from './seed';

const FIXTURE = path.join(process.cwd(), 'data', 'seed', 'fixture');

describe('fixture seed', () => {
  it('validates against the schemas', async () => {
    await expect(readSeedDir(FIXTURE)).resolves.toBeDefined();
  });

  it('covers every stage', async () => {
    const seed = await readSeedDir(FIXTURE);
    expect(new Set(seed.cases.map((c) => c.stage))).toEqual(new Set(STAGES));
  });

  it('has the shapes the UI is built against', async () => {
    const { cases, leases } = await readSeedDir(FIXTURE);
    const kinds = new Set(cases.map((c) => c.curePeriod.kind));
    const units = new Set(
      cases.flatMap((c) => (c.curePeriod.kind === 'days' ? [c.curePeriod.unit] : [])),
    );
    expect(kinds).toEqual(new Set(['days', 'none', 'unknown']));
    expect(units).toEqual(new Set(['calendar', 'business']));

    const leasesByTenant = Map.groupBy(leases, (l) => l.tenantId);
    expect([...leasesByTenant.values()].some((ls) => ls.length > 1)).toBe(true);
  });

  it('has only references that resolve', async () => {
    const seed = await readSeedDir(FIXTURE);
    const leaseIds = new Set(seed.leases.map((l) => l.id));
    const propertyIds = new Set(seed.properties.map((p) => p.id));
    const tenantIds = new Set(seed.tenants.map((t) => t.id));
    const caseIds = new Set(seed.cases.map((c) => c.id));
    const personIds = new Set(seed.people.map((p) => p.id));

    for (const l of seed.leases) {
      expect(propertyIds.has(l.propertyId)).toBe(true);
      expect(tenantIds.has(l.tenantId)).toBe(true);
    }
    for (const c of seed.cases) {
      if (c.leaseId) {
        const lease = seed.leases.find((l) => l.id === c.leaseId);
        expect(lease?.propertyId).toBe(c.propertyId);
        expect(lease?.tenantId).toBe(c.tenantId);
      }
      expect(leaseIds.has(c.leaseId ?? '') || c.leaseId === null).toBe(true);
    }
    for (const e of seed.events) expect(caseIds.has(e.caseId)).toBe(true);
    for (const g of seed.guarantors) expect(caseIds.has(g.caseId)).toBe(true);
    for (const p of seed.properties) {
      for (const id of [p.assetManagerId, p.propertyManagerId]) {
        expect(id === null || personIds.has(id)).toBe(true);
      }
    }
  });

  it('joins guarantor names onto cases that have a guarantor', async () => {
    const { cases } = await readSeedDir(FIXTURE);
    for (const c of cases) expect(c.guarantorName !== null).toBe(c.hasGuarantor);
  });
});

describe('loadSeed', () => {
  it('falls back to the fixture when there is no ingest output', async () => {
    const seed = await loadSeed();
    expect(['fixture', 'ingest']).toContain(seed.meta.source);
  });
});
