import type { Tenant } from '@/domain/types';
import { NEAR_MATCH_MAX_DISTANCE } from './rules/config';
import { editDistance, normalizeName, slug } from './normalize';

export interface TenantRegistry {
  tenants: Tenant[];
  /** Tenant id for any raw spelling that was registered. */
  idFor(rawName: string): string;
  displayNameOf(tenantId: string): string;
  /** Pairs of different tenants whose normalized names are within the near-match distance. */
  nearMatches: [Tenant, Tenant][];
}

/**
 * Exact normalized matches share a tenant; near matches stay separate and are reported.
 * The display name is the most common raw spelling, preferring the longer (entity suffix) on ties.
 * Ids come from the normalized name, so they don't shift when other rows change.
 */
export function buildTenantRegistry(rawNames: readonly string[]): TenantRegistry {
  const groups = new Map<string, Map<string, number>>();
  for (const raw of rawNames) {
    const name = raw.trim();
    if (name === '') continue;
    const key = normalizeName(name);
    const spellings = groups.get(key) ?? new Map<string, number>();
    spellings.set(name, (spellings.get(name) ?? 0) + 1);
    groups.set(key, spellings);
  }

  const idByKey = new Map<string, string>();
  const tenants: Tenant[] = [];
  for (const key of [...groups.keys()].sort()) {
    const spellings = [...groups.get(key)!].sort(
      ([a, na], [b, nb]) => nb - na || b.length - a.length || a.localeCompare(b),
    );
    const id = `T-${slug(key)}`;
    idByKey.set(key, id);
    const displayName = spellings[0][0];
    tenants.push({
      id,
      displayName,
      nameVariants: spellings
        .map(([name]) => name)
        .filter((name) => name !== displayName)
        .sort(),
    });
  }

  const nearMatches: [Tenant, Tenant][] = [];
  const keys = [...groups.keys()].sort();
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      if (editDistance(keys[i], keys[j]) <= NEAR_MATCH_MAX_DISTANCE) {
        const [a, b] = [idByKey.get(keys[i])!, idByKey.get(keys[j])!];
        nearMatches.push([tenants.find((t) => t.id === a)!, tenants.find((t) => t.id === b)!]);
      }
    }
  }

  const byId = new Map(tenants.map((t) => [t.id, t]));
  return {
    tenants,
    idFor(rawName) {
      const id = idByKey.get(normalizeName(rawName));
      if (id === undefined) throw new Error('Tenant name was not registered');
      return id;
    },
    displayNameOf: (id) => byId.get(id)!.displayName,
    nearMatches,
  };
}
