import { can } from '@/domain/permissions';
import type { Seed } from '@/domain/schemas';
import type { Action, Persona, PersonaKind } from '@/domain/types';

export const LEGAL_PERSONA_ID = 'maya';
export const FOUNDER_PERSONA_ID = 'founder';

const slug = (personId: string) => personId.replace(/^PER-/, '');

/** Maya (Legal) and the Founder, then one persona per asset manager and property manager. */
export function buildPersonas(seed: Pick<Seed, 'people' | 'properties'>): Persona[] {
  const personas: Persona[] = [
    {
      id: LEGAL_PERSONA_ID,
      label: 'Maya',
      kind: 'legal',
      personId: null,
      team: 'legal',
      scopePropertyIds: 'all',
    },
    {
      id: FOUNDER_PERSONA_ID,
      label: 'Founder',
      kind: 'founder',
      personId: null,
      team: null,
      scopePropertyIds: 'all',
    },
  ];

  const people = [...seed.people].sort((a, b) => a.name.localeCompare(b.name));
  for (const role of ['asset_manager', 'property_manager'] as const) {
    for (const person of people.filter((p) => p.roles.includes(role))) {
      const managed = seed.properties.filter((p) =>
        role === 'asset_manager'
          ? p.assetManagerId === person.id
          : p.propertyManagerId === person.id,
      );
      personas.push({
        id: `${role === 'asset_manager' ? 'am' : 'pm'}-${slug(person.id)}`,
        label: person.name,
        kind: role,
        personId: person.id,
        team: role === 'asset_manager' ? 'asset_management' : null,
        scopePropertyIds: managed.map((p) => p.id),
      });
    }
  }
  return personas;
}

/** First candidate that names a real persona, else Maya. Candidates are tried in order. */
export function resolvePersonaId(
  personas: readonly Persona[],
  ...candidates: (string | null | undefined)[]
): string {
  const found = candidates.find((id) => id && personas.some((p) => p.id === id));
  return found ?? LEGAL_PERSONA_ID;
}

const KIND_LABELS: Record<PersonaKind, string> = {
  legal: 'Legal',
  asset_manager: 'Asset manager',
  property_manager: 'Property manager',
  founder: 'Founder',
};

export const personaKindLabel = (kind: PersonaKind) => KIND_LABELS[kind];

/** "Lena · Asset manager · can add updates on 4 properties", for the always-visible chip. */
export function describePersona(persona: Persona): string {
  const first = persona.label.split(' ')[0];
  const kind = personaKindLabel(persona.kind);
  const count = persona.scopePropertyIds === 'all' ? null : persona.scopePropertyIds.length;
  const scope =
    count === null ? 'all properties' : `${count} ${count === 1 ? 'property' : 'properties'}`;
  const access = can(persona, 'edit_case')
    ? `full access to ${scope}`
    : can(persona, 'add_update')
      ? `can add updates on ${scope}`
      : `read-only on ${scope}`;
  return persona.kind === 'founder' ? `${first} · ${access}` : `${first} · ${kind} · ${access}`;
}

export interface NavItem {
  href: string;
  label: string;
  /** The action a persona needs for the item to show. */
  requires: Action;
}

/**
 * Nav is gated by `can()`, never by persona kind. "Waiting on me" is for anyone who can add
 * updates; the watchlist and weekly summary follow analytics access.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/cases', label: 'Cases', requires: 'view_case' },
  { href: '/inbox', label: 'Waiting on me', requires: 'add_update' },
  { href: '/tenants', label: 'Tenants', requires: 'view_case' },
  { href: '/outbox', label: 'Outbox', requires: 'send_notification' },
  { href: '/analytics', label: 'Analytics', requires: 'view_analytics' },
  { href: '/watchlist', label: 'Watchlist', requires: 'view_analytics' },
  { href: '/summary', label: 'Weekly summary', requires: 'view_analytics' },
  { href: '/data-quality', label: 'Data quality', requires: 'view_data_quality' },
];

export function navFor(persona: Persona): NavItem[] {
  return NAV_ITEMS.filter((item) => can(persona, item.requires));
}
