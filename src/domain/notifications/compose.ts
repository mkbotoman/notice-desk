import type {
  Case,
  ISODate,
  ISODateTime,
  Notification,
  NotificationStatus,
  NotificationTrigger,
  Persona,
} from '../types';
import { cureDeadline } from '../deadline';
import { greetingName, type Recipient } from './recipients';
import { buildMergeFields, renderTemplate, type Rendered, type TemplateId } from './templates';
import { sourcesFor, type NotificationRefs } from './triggers';

/** The template's text for a case, as the composer first shows it. */
export function renderForCase(
  templateId: TemplateId,
  c: Case,
  recipient: Recipient,
  input: { asOf: ISODate; refs: NotificationRefs; personas: readonly Persona[] },
): Rendered {
  const fields = buildMergeFields(c, sourcesFor(c, input.refs, input.asOf), {
    deadline: cureDeadline(c.dateSent, c.curePeriod),
    recipientName: greetingName(recipient.personaId, input.personas),
  });
  return renderTemplate(templateId, fields);
}

export interface ManualInput {
  id: string;
  caseId: string;
  recipient: Recipient;
  subject: string;
  body: string;
  /** The template the text started from, with the text it produced. Null when typed freely. */
  template: { rendered: Rendered } | null;
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
    status: input.status,
    createdAt: input.now,
    ...(input.status === 'sent' ? { sentAt: input.now } : {}),
  };
}

function requireDraft(n: Notification) {
  if (n.status !== 'draft') throw new Error('Only a draft can be changed');
}

/** An automatic draft keeps its trigger; editing its text marks it as hand-written. */
export function editDraft(n: Notification, edit: { subject: string; body: string }): Notification {
  requireDraft(n);
  requireText(edit.subject, edit.body);
  const changed = edit.subject !== n.subject || edit.body !== n.body;
  return {
    ...n,
    subject: edit.subject,
    body: edit.body,
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
