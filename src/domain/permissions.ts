import type { Action, Case, Persona, PersonaKind } from './types';

/** Kind-level grants. `scoped` actions also require the case to sit in the persona's scope. */
const GRANTS: Record<PersonaKind, ReadonlySet<Action>> = {
  legal: new Set<Action>([
    'view_case',
    'edit_case',
    'advance_stage',
    'change_owner',
    'add_update',
    'send_notification',
    'view_guarantor',
    'view_analytics',
    'view_data_quality',
  ]),
  asset_manager: new Set<Action>(['view_case', 'change_owner', 'add_update', 'view_analytics']),
  property_manager: new Set<Action>(['view_case']),
  founder: new Set<Action>(['view_case', 'view_guarantor', 'view_analytics', 'view_data_quality']),
};

const SCOPED: ReadonlySet<Action> = new Set<Action>([
  'view_case',
  'edit_case',
  'advance_stage',
  'change_owner',
  'add_update',
  'send_notification',
  'view_guarantor',
]);

export function inScope(persona: Persona, propertyId: string | null): boolean {
  if (persona.scopePropertyIds === 'all') return true;
  return propertyId !== null && persona.scopePropertyIds.includes(propertyId);
}

/**
 * Without a case this answers the kind-level question ("may this persona ever do X?"), which is
 * what the nav uses. With a case it also applies property scope, and an asset manager may only
 * change the owner of a case currently with asset management (handing it back to Legal).
 */
export function can(persona: Persona, action: Action, caseRecord?: Case): boolean {
  if (!GRANTS[persona.kind].has(action)) return false;
  if (!caseRecord || !SCOPED.has(action)) return true;
  if (!inScope(persona, caseRecord.propertyId)) return false;
  if (persona.kind === 'asset_manager' && action === 'change_owner') {
    return caseRecord.owner === 'asset_management';
  }
  return true;
}
