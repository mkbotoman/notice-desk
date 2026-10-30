import { personaOptionLabel } from '@/lib/persona/personas';
import type { Persona, Property, Team } from '../types';

export interface Recipient {
  personaId: string | null;
  label: string;
}

export const LEGAL_PERSONA_ID = 'maya';

export function personaRecipient(persona: Persona): Recipient {
  return { personaId: persona.id, label: personaOptionLabel(persona) };
}

export function legalRecipient(personas: readonly Persona[]): Recipient {
  const maya = personas.find((p) => p.id === LEGAL_PERSONA_ID);
  return maya ? personaRecipient(maya) : { personaId: null, label: 'Legal' };
}

/** The asset manager of a property, or an unresolved recipient that says why. */
export function assetManagerRecipient(
  property: Property | undefined,
  personas: readonly Persona[],
): Recipient {
  if (!property) return { personaId: null, label: 'Asset manager (property unknown)' };
  const found = personas.find(
    (p) => p.kind === 'asset_manager' && p.personId === property.assetManagerId,
  );
  return found
    ? personaRecipient(found)
    : { personaId: null, label: `Asset manager (none assigned, ${property.name})` };
}

export function teamRecipient(
  team: Team,
  property: Property | undefined,
  personas: readonly Persona[],
): Recipient {
  return team === 'legal' ? legalRecipient(personas) : assetManagerRecipient(property, personas);
}

/** "Lena Park" becomes "Lena"; null when there is no named person to greet. */
export function greetingName(
  personaId: string | null,
  personas: readonly Persona[],
): string | null {
  const persona = personas.find((p) => p.id === personaId);
  return persona ? persona.label.split(' ')[0] : null;
}
