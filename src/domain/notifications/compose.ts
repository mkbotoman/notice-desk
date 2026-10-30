import type {
  Case,
  CaseEvent,
  ISODate,
  ISODateTime,
  Notification,
  NotificationRecipe,
  NotificationStatus,
  NotificationTrigger,
  Persona,
} from '../types';
import { caseDeadline, cureDeadline } from '../deadline';
import { audienceFor, greetingName, propertyContactRecipient, type Recipient } from './recipients';
import { buildMergeFields, renderTemplate, type Rendered, type TemplateId } from './templates';
import { sourcesFor, type NotificationRefs } from './triggers';

interface RenderInput {
  asOf: ISODate;
  refs: NotificationRefs;
  personas: readonly Persona[];
}

/**
 * The template's text for a case, as the composer first shows it. Maya gets the internal wording;
 * anyone else gets the version written for the tenant. `recipe` carries the facts of an automatic
 * draft (the stage it moved to, the deadline it was about) so a re-render says the same thing.
 */
export function renderForCase(
  templateId: TemplateId,
  c: Case,
  recipient: Recipient,
  input: RenderInput,
  recipe?: NotificationRecipe,
): Rendered {
  const sources = sourcesFor(c, input.refs, input.asOf);
  const fields = buildMergeFields(
    c,
    { ...sources, coi: recipe?.coi ?? sources.coi },
    {
      stage: recipe?.stage,
      previousStage: recipe?.previousStage,
      owner: recipe?.owner,
      deadline: recipe?.deadline ?? cureDeadline(c.dateSent, c.curePeriod),
      recipientName: greetingName(recipient.personaId, input.personas),
    },
  );
  return renderTemplate(templateId, fields, audienceFor(recipient.personaId, input.personas));
}

/**
 * What an automatic draft was about. Drafts saved before recipes existed have none, so it is
 * rebuilt from the trigger and the case event that raised it.
 */
function recipeOf(n: Notification, events: readonly CaseEvent[]): NotificationRecipe | null {
  if (n.recipe) return n.recipe;
  if (n.trigger === 'manual') return null;
  const event = events.find((e) => e.id === n.dedupeKey);
  if (n.trigger === 'stage_changed' && event?.type === 'stage_changed') {
    return { template: n.trigger, stage: event.payload.to, previousStage: event.payload.from };
  }
  if (n.trigger === 'owner_changed' && event?.type === 'owner_changed') {
    return { template: n.trigger, owner: event.payload.to };
  }
  return { template: n.trigger };
}

/** A draft's text for a given recipient; null for a notification that cannot be re-rendered. */
export function renderNotification(
  n: Notification,
  c: Case,
  recipient: Recipient,
  input: RenderInput & { events?: readonly CaseEvent[] },
): Rendered | null {
  const recipe = recipeOf(n, input.events ?? []);
  return recipe ? renderForCase(recipe.template, c, recipient, input, recipe) : null;
}

/** The template that fits where the case is: overdue, due soon, or just its stage. */
export function defaultTemplate(c: Case, asOf: ISODate): TemplateId {
  const { status } = caseDeadline(c, asOf);
  if (status === 'overdue') return 'deadline_passed';
  if (status === 'due_this_week' || status === 'upcoming') return 'deadline_approaching';
  return 'stage_changed';
}

/** The property's property manager: never the person looking at the app. */
export function defaultRecipient(
  c: Case,
  input: { refs: NotificationRefs; personas: readonly Persona[] },
): Recipient {
  const property = c.propertyId ? input.refs.propertyById.get(c.propertyId) : undefined;
  return propertyContactRecipient(property, input.personas);
}

export interface ManualInput {
  id: string;
  caseId: string;
  recipient: Recipient;
  subject: string;
  body: string;
  /** The template the text started from, with the text it produced. Null when typed freely. */
  template: { rendered: Rendered; id: TemplateId } | null;
  status: 'draft' | 'sent';
  now: ISODateTime;
}

const clean = (text: string) => text.trim();

function requireText(subject: string, body: string) {
  if (clean(subject) === '' || clean(body) === '') {
    throw new Error('A notification needs a subject and a message');
  }
}

/** `template` source only while the text is exactly what the template produced. */
export function buildManualNotification(input: ManualInput): Notification {
  requireText(input.subject, input.body);
  const unedited =
    input.template !== null &&
    input.template.rendered.subject === input.subject &&
    input.template.rendered.body === input.body;
  return {
    id: input.id,
    caseId: input.caseId,
    trigger: 'manual',
    dedupeKey: input.id,
    recipientPersonaId: input.recipient.personaId,
    recipientLabel: input.recipient.label,
    subject: input.subject,
    body: input.body,
    source: unedited ? 'template' : 'manual',
    ...(input.template ? { recipe: { template: input.template.id } } : {}),
    status: input.status,
    createdAt: input.now,
    ...(input.status === 'sent' ? { sentAt: input.now } : {}),
  };
}

function requireDraft(n: Notification) {
  if (n.status !== 'draft') throw new Error('Only a draft can be changed');
}

/** An automatic draft keeps its trigger; editing its text marks it as hand-written. */
export function editDraft(
  n: Notification,
  edit: { subject: string; body: string; recipient?: Recipient },
): Notification {
  requireDraft(n);
  requireText(edit.subject, edit.body);
  const changed = edit.subject !== n.subject || edit.body !== n.body;
  return {
    ...n,
    subject: edit.subject,
    body: edit.body,
    ...(edit.recipient
      ? { recipientPersonaId: edit.recipient.personaId, recipientLabel: edit.recipient.label }
      : {}),
    source: changed && n.source === 'template' ? 'manual' : n.source,
  };
}

export function sendDraft(n: Notification, now: ISODateTime): Notification {
  requireDraft(n);
  requireText(n.subject, n.body);
  return { ...n, status: 'sent', sentAt: now };
}

export function dismissDraft(n: Notification): Notification {
  requireDraft(n);
  return { ...n, status: 'dismissed' };
}

export const TRIGGER_LABELS: Record<NotificationTrigger, string> = {
  deadline_approaching: 'Deadline approaching',
  deadline_passed: 'Deadline passed',
  stage_changed: 'Stage changed',
  owner_changed: 'Owner changed',
  coi_expiring: 'Insurance expiring',
  manual: 'Manual',
};

export interface OutboxFilter {
  status: NotificationStatus;
  caseId: string | null;
  /** Persona id, or the label for a recipient that is not a persona. */
  recipient: string | null;
}

export const recipientKey = (n: Pick<Notification, 'recipientPersonaId' | 'recipientLabel'>) =>
  n.recipientPersonaId ?? n.recipientLabel;

/** Newest first. */
export function filterNotifications(
  list: readonly Notification[],
  filter: OutboxFilter,
): Notification[] {
  return list
    .filter(
      (n) =>
        n.status === filter.status &&
        (filter.caseId === null || n.caseId === filter.caseId) &&
        (filter.recipient === null || recipientKey(n) === filter.recipient),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

/** Tab counts respect the case and recipient filters. */
export function countByStatus(
  list: readonly Notification[],
  filter: Omit<OutboxFilter, 'status'>,
): Record<NotificationStatus, number> {
  return {
    draft: filterNotifications(list, { ...filter, status: 'draft' }).length,
    sent: filterNotifications(list, { ...filter, status: 'sent' }).length,
    dismissed: filterNotifications(list, { ...filter, status: 'dismissed' }).length,
  };
}
