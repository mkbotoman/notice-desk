import { personaOptionLabel } from '@/lib/persona/personas';
import type { Persona, Property } from '../types';
import type { Audience } from './templates';

export interface Recipient {
  personaId: string | null;
  label: string;
}

export function personaRecipient(persona: Persona): Recipient {
  return { personaId: persona.id, label: personaOptionLabel(persona) };
}

function persons(property: Property | undefined, personas: readonly Persona[]) {
  const manager = personas.find(
    (p) => p.kind === 'property_manager' && !!property && p.personId === property.propertyManagerId,
  );
  const assetManager = personas.find(
    (p) => p.kind === 'asset_manager' && !!property && p.personId === property.assetManagerId,
  );
  return { manager, assetManager };
}

/**
 * Who a notification about a case at this property is for: the property's own property manager,
 * who deals with the tenant day to day. Falls back to the asset manager, and otherwise says
 * plainly that nobody is assigned. It is never the person who happens to be looking at the app.
 */
export function propertyContactRecipient(
  property: Property | undefined,
  personas: readonly Persona[],
): Recipient {
  if (!property) return { personaId: null, label: 'Property manager (property unknown)' };
  const { manager, assetManager } = persons(property, personas);
  const found = manager ?? assetManager;
  return found
    ? personaRecipient(found)
    : { personaId: null, label: `Property manager (none assigned, ${property.name})` };
}

/** The property's property manager and asset manager, for the top of a recipient picker. */
export function propertyPeople(
  property: Property | undefined,
  personas: readonly Persona[],
): Persona[] {
  const { manager, assetManager } = persons(property, personas);
  return [manager, assetManager].filter((p): p is Persona => p !== undefined);
}

/** "Lena Park" becomes "Lena"; null when there is no named person to greet. */
export function greetingName(
  personaId: string | null,
  personas: readonly Persona[],
): string | null {
  const persona = personas.find((p) => p.id === personaId);
  return persona ? persona.label.split(' ')[0] : null;
}

/**
 * The wording follows who is reading. Nobody chosen yet reads the version for the tenant, which
 * is what automatic drafts to the property's property manager use.
 */
export function audienceFor(personaId: string | null, personas: readonly Persona[]): Audience {
  return personas.find((p) => p.id === personaId)?.kind ?? 'property_manager';
}
