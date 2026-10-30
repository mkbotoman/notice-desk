import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { can } from '@/domain/permissions';
import type { Seed } from '@/domain/schemas';
import type { Persona } from '@/domain/types';
import { readSeedDir } from '@/lib/seed';
import { isValidAsOf, resolveAsOf, todayISO } from './asof';
import {
  buildPersonas,
  describePersona,
  navFor,
  personaKindLabel,
  resolvePersonaId,
} from './personas';

let seed: Seed;
let personas: Persona[];
beforeAll(async () => {
  seed = await readSeedDir(path.join(process.cwd(), 'data', 'seed', 'fixture'));
  personas = buildPersonas(seed);
});

const byId = (id: string) => personas.find((p) => p.id === id)!;
const navLabels = (id: string) => navFor(byId(id)).map((n) => n.label);

describe('buildPersonas', () => {
  it('lists Maya and the Founder first, then asset managers, then property managers', () => {
    expect(personas.map((p) => p.id)).toEqual([
      'maya',
      'founder',
      'am-lena-park',
      'am-omar-reyes',
      'pm-dan-whitfield',
      'pm-priya-shah',
    ]);
  });

  it('scopes managers to the properties they manage', () => {
    expect(byId('am-lena-park').scopePropertyIds).toEqual(['P-01', 'P-02']);
    expect(byId('pm-dan-whitfield').scopePropertyIds).toEqual(['P-02', 'P-03']);
    expect(byId('maya').scopePropertyIds).toBe('all');
    expect(byId('founder').scopePropertyIds).toBe('all');
  });

  it('gives asset managers the asset-management team, and nobody else but Maya a team', () => {
    expect(byId('am-lena-park')).toMatchObject({ team: 'asset_management', kind: 'asset_manager' });
    expect(byId('maya').team).toBe('legal');
    expect(byId('founder').team).toBeNull();
    expect(byId('pm-priya-shah').team).toBeNull();
  });

  it('keeps ids unique even when one person holds both roles', () => {
    const both = buildPersonas({
      people: [
        { id: 'PER-sam-lee', name: 'Sam Lee', roles: ['asset_manager', 'property_manager'] },
      ],
      properties: [],
    });
    expect(both.map((p) => p.id)).toEqual(['maya', 'founder', 'am-sam-lee', 'pm-sam-lee']);
    expect(both.at(-1)?.scopePropertyIds).toEqual([]);
  });
});

describe('resolvePersonaId', () => {
  it('takes the first candidate that exists, else Maya', () => {
    expect(resolvePersonaId(personas, 'am-lena-park', 'founder')).toBe('am-lena-park');
    expect(resolvePersonaId(personas, 'nobody', null, 'founder')).toBe('founder');
    expect(resolvePersonaId(personas, 'nobody', undefined, '')).toBe('maya');
    expect(resolvePersonaId(personas)).toBe('maya');
  });
});

describe('navFor', () => {
  it('shows Maya everything', () => {
    expect(navLabels('maya')).toEqual([
      'Cases',
      'Waiting on me',
      'Tenants',
      'Outbox',
      'Analytics',
      'Watchlist',
      'Weekly summary',
      'Data quality',
    ]);
  });

  it('shows an asset manager their cases, inbox, tenants and read-only analytics', () => {
    expect(navLabels('am-lena-park')).toEqual([
      'Cases',
      'Waiting on me',
      'Tenants',
      'Analytics',
      'Watchlist',
      'Weekly summary',
    ]);
  });

  it('shows the founder portfolio views but no inbox or outbox', () => {
    expect(navLabels('founder')).toEqual([
      'Cases',
      'Tenants',
      'Analytics',
      'Watchlist',
      'Weekly summary',
      'Data quality',
    ]);
  });

  it('shows a property manager only cases and tenants', () => {
    expect(navLabels('pm-priya-shah')).toEqual(['Cases', 'Tenants']);
  });

  it('never shows an item the persona cannot act on', () => {
    for (const p of personas) {
      for (const item of navFor(p)) expect(can(p, item.requires)).toBe(true);
    }
  });
});

describe('describePersona', () => {
  it('says what the persona can do and where', () => {
    expect(describePersona(byId('am-lena-park'))).toBe(
      'Lena · Asset manager · can add updates on 2 properties',
    );
    expect(describePersona(byId('maya'))).toBe('Maya · Legal · full access to all properties');
    expect(describePersona(byId('founder'))).toBe('Founder · read-only on all properties');
    expect(describePersona(byId('pm-priya-shah'))).toBe(
      'Priya · Property manager · read-only on 1 property',
    );
  });

  it('labels each kind', () => {
    expect(personaKindLabel('asset_manager')).toBe('Asset manager');
  });
});

describe('asOf helpers', () => {
  it('accepts real calendar dates only', () => {
    expect(isValidAsOf('2026-10-13')).toBe(true);
    expect(isValidAsOf('2026-02-30')).toBe(false);
    expect(isValidAsOf('10/13/2026')).toBe(false);
    expect(isValidAsOf('')).toBe(false);
    expect(isValidAsOf(null)).toBe(false);
    expect(isValidAsOf(undefined)).toBe(false);
  });

  it('formats today from a local date', () => {
    expect(todayISO(new Date(2026, 9, 30, 23, 59))).toBe('2026-10-30');
  });

  it('prefers the first valid candidate, else the fallback', () => {
    expect(resolveAsOf('2026-10-13', 'junk', '2026-11-01', '2026-12-01')).toBe('2026-11-01');
    expect(resolveAsOf('2026-10-13', null, 'junk')).toBe('2026-10-13');
    expect(resolveAsOf('2026-10-13')).toBe('2026-10-13');
  });
});
