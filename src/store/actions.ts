import { MAX_CURE_DAYS } from '@/domain/cure';
import { can } from '@/domain/permissions';
import { allowedTransitions } from '@/domain/stage';
import type {
  Case,
  CaseEvent,
  ISODate,
  Lease,
  NoticeDetails,
  Persona,
  Stage,
  Team,
} from '@/domain/types';
import type { LeaseSignal } from '@/domain/watchlist';

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

const randomId = () => crypto.randomUUID().slice(0, 8);

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

/** Moving to Notice to Cure needs the notice's send date and cure period; no other move takes them. */
function checkNotice(to: Stage, notice: NoticeDetails | undefined): void {
  if (to !== 'notice_to_cure') {
    if (notice) throw new Error('Only a Notice to Cure carries notice details');
    return;
  }
  if (!notice) throw new Error('A Notice to Cure needs a send date and a cure period');
  const { curePeriod } = notice;
  if (curePeriod.kind === 'unknown') throw new Error('Choose a cure period, or "No cure date"');
  if (curePeriod.kind === 'days' && curePeriod.n > MAX_CURE_DAYS) {
    throw new Error(`A cure period can't be longer than ${MAX_CURE_DAYS} days`);
  }
}

export function buildAdvance(
  c: Case,
  to: Stage,
  ctx: ActionContext,
  note?: string,
  notice?: NoticeDetails,
): CaseEvent {
  if (!can(ctx.persona, 'advance_stage', c))
    throw new PermissionError("You can't move this case forward");
  if (!allowedTransitions(c.stage).includes(to))
    throw new Error(`Can't move from ${c.stage} to ${to}`);
  checkNotice(to, notice);
  return {
    ...base(c, ctx, ctx.asOf, note),
    type: 'stage_changed',
    payload: { from: c.stage, to, ...(notice ? { notice } : {}) },
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

export interface NotificationEventOptions {
  /** True for drafts raised by the app itself (deadline and COI triggers). They are logged as `system`. */
  automatic?: boolean;
  /** A fixed event id, so the same automatic draft logs the same event however many tabs raise it. */
  id?: string;
}

/** Logs that a notification was drafted, sent or dismissed on a case. */
export function buildNotificationEvent(
  c: Case,
  type: 'notification_drafted' | 'notification_sent' | 'notification_dismissed',
  notificationId: string,
  ctx: ActionContext,
  options: NotificationEventOptions = {},
): CaseEvent {
  if (!options.automatic && !can(ctx.persona, 'send_notification', c)) {
    throw new PermissionError("You can't send notifications for this case");
  }
  const event = base(c, ctx, ctx.asOf);
  return {
    ...event,
    id: options.id ?? event.id,
    actorPersonaId: options.automatic ? 'system' : event.actorPersonaId,
    type,
    payload: { notificationId },
  };
}

/**
 * A new Non-Compliant case for a lease the watchlist flagged. Legal-owned, no notice sent yet, so
 * no deadline. The `case_opened` event records why it was opened.
 */
export function buildOpenCase(
  lease: Lease,
  signals: readonly LeaseSignal[],
  ctx: ActionContext,
): { newCase: Case; event: CaseEvent } {
  if (!can(ctx.persona, 'edit_case')) throw new PermissionError("You can't open cases");
  if (signals.length === 0) throw new Error('There is nothing to open a case for');

  const rent = signals.some((s) => s.kind === 'rent');
  const insurance = signals.some((s) => s.kind === 'insurance');
  const now = (ctx.now ?? (() => new Date()))();
  const newCase: Case = {
    id: `W-${lease.id}-${now.getTime().toString(36)}`,
    leaseId: lease.id,
    tenantId: lease.tenantId,
    propertyId: lease.propertyId,
    stage: 'non_compliant',
    issueType: rent ? 'monetary' : insurance ? 'insurance' : 'other_lease_term',
    dateSent: null,
    curePeriod: { kind: 'none' },
    owner: 'legal',
    amountOwedAtNotice:
      rent && lease.arBalance !== null && lease.arBalance > 0 ? lease.arBalance : null,
    legalFeesTerms: null,
    lenderNotice: null,
    workflowStatus: null,
    courtCaseNo: null,
    guarantorName: null,
    hasGuarantor: false,
  };
  const event = {
    ...base(
      newCase,
      ctx,
      ctx.asOf,
      `Opened from the watchlist: ${signals.map((s) => s.label).join('; ')}`,
    ),
    type: 'case_opened' as const,
    payload: {},
  };
  return { newCase, event };
}
