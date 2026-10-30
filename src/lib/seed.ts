import { access, readFile } from 'node:fs/promises';
import { cacheLife } from 'next/cache';
import path from 'node:path';
import { SeedSchema, type Seed } from '@/domain/schemas';

const SEED_ROOT = path.join(process.cwd(), 'data', 'seed');

const FILES = [
  'meta',
  'properties',
  'people',
  'tenants',
  'leases',
  'cases',
  'events',
  'coi',
  'guarantors',
] as const;

async function readJson(dir: string, name: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(dir, `${name}.json`), 'utf8'));
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

/** Reads one seed directory, validates it, and joins guarantor names back onto their cases. */
export async function readSeedDir(dir: string): Promise<Seed> {
  const entries = await Promise.all(FILES.map(async (name) => [name, await readJson(dir, name)]));
  const seed = SeedSchema.parse(Object.fromEntries(entries));
  const guarantorByCase = new Map(seed.guarantors.map((g) => [g.caseId, g.name]));
  return {
    ...seed,
    cases: seed.cases.map((c) => ({ ...c, guarantorName: guarantorByCase.get(c.id) ?? null })),
  };
}

/** Ingest output when `pnpm ingest` has run, otherwise the hand-built fixture. */
export async function readSeed(root: string = SEED_ROOT): Promise<Seed> {
  const hasIngestOutput = await exists(path.join(root, 'meta.json'));
  return readSeedDir(hasIngestOutput ? root : path.join(root, 'fixture'));
}

/** The seed for the app. Cached because it only changes when the site is rebuilt. */
export async function loadSeed(): Promise<Seed> {
  'use cache';
  cacheLife('max');
  return readSeed();
}
