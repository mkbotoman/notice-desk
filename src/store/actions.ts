import { can } from '@/domain/permissions';
import { allowedTransitions } from '@/domain/stage';
import type { Case, CaseEvent, ISODate, Persona, Stage, Team } from '@/domain/types';

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

/** Who is acting, and when. `now` and `newId` exist so tests are deterministic. */
export interface ActionContext {
  persona: Persona;
  asOf: ISODate;
  now?: () => Date;
  newId?: () => string;
}

const randomId = () => Math.random().toString(36).slice(2, 8);

function base(c: Case, ctx: ActionContext, effectiveDate: ISODate, note?: string) {
  const now = (ctx.now ?? (() => new Date()))();
  const suffix = (ctx.newId ?? randomId)();
  return {
    id: `EV-${c.id}-${now.getTime().toString(36)}-${suffix}`,
    caseId: c.id,
    at: now.toISOString(),
    effectiveDate,
    actorPersonaId: ctx.persona.id,
    ...(note?.trim() ? { note: note.trim() } : {}),
  };
}

/** A dated update. The date defaults to the as-of date. */
export function buildUpdate(c: Case, text: string, ctx: ActionContext, date?: ISODate): CaseEvent {
  if (!can(ctx.persona, 'add_update', c))
    throw new PermissionError("You can't add updates to this case");
  if (text.trim() === '') throw new Error('An update needs some text');
  return { ...base(c, ctx, date ?? ctx.asOf, text), type: 'note', payload: {} };
}

export function buildAdvance(c: Case, to: Stage, ctx: ActionContext, note?: string): CaseEvent {
  if (!can(ctx.persona, 'advance_stage', c))
    throw new PermissionError("You can't move this case forward");
  if (!allowedTransitions(c.stage).includes(to))
    throw new Error(`Can't move from ${c.stage} to ${to}`);
  return {
    ...base(c, ctx, ctx.asOf, note),
    type: 'stage_changed',
    payload: { from: c.stage, to },
  };
}

/** Asset managers may only hand a case back to Legal; Legal may hand it to either team. */
export function buildOwnerChange(c: Case, to: Team, ctx: ActionContext, note?: string): CaseEvent {
  if (!can(ctx.persona, 'change_owner', c))
    throw new PermissionError("You can't change who owns this case");
  if (ctx.persona.kind === 'asset_manager' && to !== 'legal') {
    throw new PermissionError('Asset managers can only hand a case back to Legal');
  }
  return {
    ...base(c, ctx, ctx.asOf, note),
    type: 'owner_changed',
    payload: { from: c.owner, to },
  };
}
