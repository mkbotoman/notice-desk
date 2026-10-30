import type { ChipTone } from '@/components/ui/chip';
import { describeCurePeriod } from '@/domain/cure';
import type { DeadlineDetail } from '@/domain/deadline';
import { can } from '@/domain/permissions';
import { allowedTransitions, isTerminal } from '@/domain/stage';
import type {
  Case,
  CaseEvent,
  CoiStatus,
  LenderNotice,
  Persona,
  Stage,
  Team,
} from '@/domain/types';
import { STAGE_LABELS, weekdayDate } from '@/lib/format';
import { personaOptionLabel } from '@/lib/persona/personas';

export type StepState = 'done' | 'current' | 'next';

export interface Step {
  key: string;
  label: string;
  state: StepState;
}

const PATH: readonly Stage[] = ['non_compliant', 'notice_to_cure', 'default', 'collections'];

/** The five-step path. Cured and Closed share the last step, which takes the case's own name. */
export function stageSteps(stage: Stage): Step[] {
  const here = PATH.indexOf(stage);
  const current = here === -1 ? PATH.length : here;
  const labels = [
    ...PATH.map((s) => STAGE_LABELS[s]),
    here === -1 ? STAGE_LABELS[stage] : 'Cured / Closed',
  ];
  return labels.map((label, i) => ({
    key: i === PATH.length ? 'final' : PATH[i],
    label,
    state: i < current ? 'done' : i === current ? 'current' : 'next',
  }));
}

/** Words for how the deadline was worked out, or why there isn't one. */
export function deadlineRule(c: Case, detail: DeadlineDetail | null): string {
  if (c.curePeriod.kind === 'none') return 'The notice gave no cure date.';
  if (c.curePeriod.kind === 'unknown') {
    return 'The cure period could not be read, so no deadline can be calculated.';
  }
  if (detail === null || c.dateSent === null) {
    return 'No send date is recorded, so no deadline can be calculated.';
  }
  const skips = [
    ...(c.curePeriod.unit === 'business' ? ['weekends'] : []),
    ...detail.skippedHolidays.map((h) => `${h.name} (${weekdayDate(h.date)})`),
  ];
  const counted = `${describeCurePeriod(c.curePeriod)} from ${weekdayDate(c.dateSent)} gives ${weekdayDate(detail.deadline)}`;
  const skipped = skips.length > 0 ? ` Skips ${skips.join(' and ')}.` : '';
  return `${counted}.${skipped} Day 1 is the day after the notice was sent.`;
}

export const LENDER_LABELS: Record<LenderNotice, string> = {
  none: 'No lender notice',
  notice_only: 'Lender notice only',
  consent_and_notice: 'Lender consent and notice',
};

export const COI_LABELS: Record<CoiStatus, string> = {
  valid: 'Valid',
  expiring: 'Expiring soon',
  expired: 'Expired',
  non_compliant: 'Non-compliant',
  missing: 'No certificate on file',
  unknown: 'Unknown',
};

export const COI_TONES: Record<CoiStatus, ChipTone> = {
  valid: 'success',
  expiring: 'warning',
  expired: 'danger',
  non_compliant: 'danger',
  missing: 'danger',
  unknown: 'gray',
};

export const ADVANCE_LABELS: Record<Stage, string> = {
  non_compliant: 'Move to Non-compliant',
  notice_to_cure: 'Move to Notice to Cure',
  default: 'Move to Default',
  collections: 'Move to Collections',
  cured: 'Mark cured',
  closed: 'Close case',
};

export interface ActionAvailability {
  advanceTo: readonly Stage[];
  /** The team the owner could change to, or null when the persona can't change it. */
  ownerTo: Team | null;
  addUpdate: boolean;
  draftNotification: boolean;
  viewGuarantor: boolean;
}

/** What the persona may do on this case right now, from `can()` and the stage machine. */
export function availableActions(persona: Persona, c: Case): ActionAvailability {
  const otherTeam: Team = c.owner === 'legal' ? 'asset_management' : 'legal';
  return {
    advanceTo: can(persona, 'advance_stage', c) ? allowedTransitions(c.stage) : [],
    ownerTo: can(persona, 'change_owner', c) && !isTerminal(c.stage) ? otherTeam : null,
    addUpdate: can(persona, 'add_update', c),
    draftNotification: can(persona, 'send_notification', c),
    viewGuarantor: can(persona, 'view_guarantor', c),
  };
}

const TEAM_NAMES: Record<Team, string> = { legal: 'Legal', asset_management: 'Asset Management' };
export const teamName = (team: Team) => TEAM_NAMES[team];

export function ownerButtonLabel(persona: Persona, to: Team): string {
  if (to === 'asset_management') return 'Hand to Asset Management';
  return persona.kind === 'legal' ? 'Take back to Legal' : 'Hand back to Legal';
}

export function actorLabel(actorPersonaId: string, personas: readonly Persona[]): string {
  if (actorPersonaId === 'import') return "Imported from Legal's sheet";
  const persona = personas.find((p) => p.id === actorPersonaId);
  return persona ? personaOptionLabel(persona) : 'Unknown person';
}

export interface EventView {
  id: string;
  date: string;
  kind: string;
  tone: ChipTone;
  /** Plain text only; always rendered as a text node. */
  summary: string | null;
  note: string | null;
}

export function describeEvent(event: CaseEvent): EventView {
  const base = { id: event.id, date: event.effectiveDate, note: event.note ?? null };
  switch (event.type) {
    case 'stage_changed':
      return {
        ...base,
        kind: 'Stage change',
        tone: 'navy',
        summary: `Moved from ${STAGE_LABELS[event.payload.from]} to ${STAGE_LABELS[event.payload.to]}`,
      };
    case 'owner_changed':
      return {
        ...base,
        kind: 'Owner change',
        tone: 'navy',
        summary: `Owner changed from ${teamName(event.payload.from)} to ${teamName(event.payload.to)}`,
      };
    case 'note':
      return { ...base, kind: 'Update', tone: 'outline', summary: null };
    case 'imported_note':
      return { ...base, kind: 'Imported', tone: 'gray', summary: null };
    case 'case_opened':
      return { ...base, kind: 'Case opened', tone: 'gray', summary: 'Case opened' };
    case 'notification_drafted':
      return { ...base, kind: 'Notification', tone: 'outline', summary: 'Notification drafted' };
    case 'notification_sent':
      return { ...base, kind: 'Notification', tone: 'success', summary: 'Notification sent' };
  }
}

/** Newest first: by business date, then by when it was recorded. */
export function newestFirst(events: readonly CaseEvent[]): CaseEvent[] {
  return [...events].sort(
    (a, b) =>
      b.effectiveDate.localeCompare(a.effectiveDate) ||
      b.at.localeCompare(a.at) ||
      b.id.localeCompare(a.id),
  );
}

export interface Delta {
  text: string;
  tone: 'warning' | 'success' | 'gray';
}

/** Live AR balance against the amount on the notice. Null when either figure is missing. */
export function balanceDelta(
  atNotice: number | null,
  live: number | null,
  format: (cents: number) => string,
): Delta | null {
  if (atNotice === null || live === null) return null;
  const diff = live - atNotice;
  if (diff === 0) return { text: 'No change since notice', tone: 'gray' };
  return diff > 0
    ? { text: `+${format(diff)} since notice`, tone: 'warning' }
    : { text: `-${format(-diff)} since notice`, tone: 'success' };
}
