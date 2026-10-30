import { effectiveCoiStatus } from '../coi';
import { cureDeadline } from '../deadline';
import { isTerminal } from '../stage';
import type {
  Case,
  CaseEvent,
  CoiRecord,
  ISODate,
  ISODateTime,
  Lease,
  Notification,
  NotificationTrigger,
  Persona,
  Property,
  Tenant,
} from '../types';
import { businessDaysUntil } from './business-days';
import {
  greetingName,
  legalRecipient,
  teamRecipient,
  assetManagerRecipient,
  type Recipient,
} from './recipients';
import {
  buildMergeFields,
  renderTemplate,
  type FieldOptions,
  type FieldSources,
  type MergeFields,
  type TemplateId,
} from './templates';

/** Reference data the triggers read. `Lookups` from the store satisfies this plus `coi`. */
export interface NotificationRefs {
  propertyById: ReadonlyMap<string, Property>;
  leaseById: ReadonlyMap<string, Lease>;
  tenantById: ReadonlyMap<string, Tenant>;
  coi: readonly CoiRecord[];
}

export const APPROACHING_BUSINESS_DAYS = 3;

export function sourcesFor(c: Case, refs: NotificationRefs, asOf: ISODate): FieldSources {
  const { leaseId } = c;
  const record = leaseId ? refs.coi.find((r) => r.leaseIds.includes(leaseId)) : undefined;
  return {
    tenant: refs.tenantById.get(c.tenantId),
    property: c.propertyId ? refs.propertyById.get(c.propertyId) : undefined,
    lease: leaseId ? refs.leaseById.get(leaseId) : undefined,
    coi: record
      ? { status: effectiveCoiStatus(record, asOf), expiresOn: record.expiresOn }
      : undefined,
  };
}

export interface TriggerInput {
  asOf: ISODate;
  now: ISODateTime;
  cases: readonly Case[];
  eventsByCase: ReadonlyMap<string, readonly CaseEvent[]>;
  /** Every notification so far, whatever its status: a dismissed draft must not come back. */
  existing: readonly Notification[];
  refs: NotificationRefs;
  personas: readonly Persona[];
}

interface Candidate {
  c: Case;
  trigger: Exclude<NotificationTrigger, 'manual'>;
  dedupeKey: string;
  recipient: Recipient;
  templateId: TemplateId;
  options: FieldOptions;
  /** Overrides what `sourcesFor` finds, for triggers that name a specific COI record. */
  coi?: FieldSources['coi'];
}

function deadlineCandidates(c: Case, input: TriggerInput): Candidate[] {
  if (c.stage !== 'notice_to_cure') return [];
  const deadline = cureDeadline(c.dateSent, c.curePeriod);
  if (deadline === null) return [];
  const property = c.propertyId ? input.refs.propertyById.get(c.propertyId) : undefined;
  const options = { deadline };

  if (deadline < input.asOf) {
    return [
      {
        c,
        trigger: 'deadline_passed',
        dedupeKey: `${c.id}:deadline_passed:${deadline}`,
        recipient: legalRecipient(input.personas),
        templateId: 'deadline_passed',
        options,
      },
    ];
  }
  if (businessDaysUntil(input.asOf, deadline) > APPROACHING_BUSINESS_DAYS) return [];
  return [
    {
      c,
      trigger: 'deadline_approaching',
      dedupeKey: `${c.id}:deadline_approaching:${deadline}`,
      recipient: teamRecipient(c.owner, property, input.personas),
      templateId: 'deadline_approaching',
      options,
    },
  ];
}

/** Only events the app recorded: the import's history is not news. */
function changeCandidates(c: Case, input: TriggerInput): Candidate[] {
  const property = c.propertyId ? input.refs.propertyById.get(c.propertyId) : undefined;
  const out: Candidate[] = [];
  for (const event of input.eventsByCase.get(c.id) ?? []) {
    if (event.actorPersonaId === 'import') continue;
    if (event.type === 'stage_changed') {
      out.push({
        c,
        trigger: 'stage_changed',
        dedupeKey: event.id,
        recipient: assetManagerRecipient(property, input.personas),
        templateId: 'stage_changed',
        options: { stage: event.payload.to, previousStage: event.payload.from },
      });
    } else if (event.type === 'owner_changed') {
      out.push({
        c,
        trigger: 'owner_changed',
        dedupeKey: event.id,
        recipient: teamRecipient(event.payload.to, property, input.personas),
        templateId: 'owner_changed',
        options: { owner: event.payload.to },
      });
    }
  }
  return out;
}

/**
 * A COI is not tied to a case, but a notification is, so it hangs off the lease's open case
 * (or, failing that, its first case). A certificate with no case at all is skipped.
 */
function coiCandidates(input: TriggerInput): Candidate[] {
  const out: Candidate[] = [];
  for (const record of input.refs.coi) {
    const status = effectiveCoiStatus(record, input.asOf);
    if (status !== 'expiring' && status !== 'expired') continue;
    const forLease = input.cases
      .filter((c) => c.leaseId !== null && record.leaseIds.includes(c.leaseId))
      .sort((a, b) => a.id.localeCompare(b.id));
    const c = forLease.find((x) => !isTerminal(x.stage)) ?? forLease[0];
    if (!c) continue;
    const property = c.propertyId ? input.refs.propertyById.get(c.propertyId) : undefined;
    out.push({
      c,
      trigger: 'coi_expiring',
      dedupeKey: `coi:${record.tenantId}:${record.propertyId ?? 'none'}:${status}:${record.expiresOn ?? 'unknown'}`,
      recipient: assetManagerRecipient(property, input.personas),
      templateId: 'coi_expiring',
      options: {},
      coi: { status, expiresOn: record.expiresOn },
    });
  }
  return out;
}

function renderCandidate(
  cand: Candidate,
  input: Pick<TriggerInput, 'asOf' | 'refs' | 'personas'>,
): { subject: string; body: string; fields: MergeFields } {
  const sources = sourcesFor(cand.c, input.refs, input.asOf);
  const fields = buildMergeFields(
    cand.c,
    { ...sources, coi: cand.coi ?? sources.coi },
    { ...cand.options, recipientName: greetingName(cand.recipient.personaId, input.personas) },
  );
  return { ...renderTemplate(cand.templateId, fields), fields };
}

/**
 * Draft notifications for every automatic trigger that fires as of `input.asOf` and has not
 * fired before. Running it again with the results added to `existing` returns nothing.
 */
export function evaluateTriggers(input: TriggerInput): Notification[] {
  const seen = new Set(input.existing.map((n) => n.dedupeKey));
  const candidates = [
    ...input.cases.flatMap((c) => [...deadlineCandidates(c, input), ...changeCandidates(c, input)]),
    ...coiCandidates(input),
  ];

  const drafts: Notification[] = [];
  for (const cand of candidates) {
    if (seen.has(cand.dedupeKey)) continue;
    seen.add(cand.dedupeKey);
    const { subject, body } = renderCandidate(cand, input);
    drafts.push({
      id: `NF-${cand.dedupeKey}`,
      caseId: cand.c.id,
      trigger: cand.trigger,
      dedupeKey: cand.dedupeKey,
      recipientPersonaId: cand.recipient.personaId,
      recipientLabel: cand.recipient.label,
      subject,
      body,
      source: 'template',
      status: 'draft',
      createdAt: input.now,
    });
  }
  return drafts;
}
