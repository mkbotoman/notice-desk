import { STAGE_LABELS, formatCents, longDate, weekdayDate } from '@/lib/format';
import type {
  Case,
  CoiStatus,
  ISODate,
  Lease,
  NotificationTrigger,
  Property,
  Stage,
  Team,
  Tenant,
} from '../types';

/**
 * Everything a template may mention. There is deliberately no field for guarantors or case
 * notes, so no template can leak them.
 */
export interface MergeFields {
  caseId: string;
  caseLink: string;
  tenant: string;
  property: string;
  /** "Harbor Commons, Suite 12", or just the property when the lease has no suite. */
  where: string;
  stage: string;
  previousStage: string | null;
  stageGuidance: string;
  owner: string;
  deadline: string | null;
  deadlineShort: string | null;
  amount: string;
  coiStatus: string;
  coiExpiry: string;
  recipientName: string | null;
}

export interface Rendered {
  subject: string;
  body: string;
}

export const TEMPLATE_IDS = [
  'deadline_approaching',
  'deadline_passed',
  'stage_changed',
  'owner_changed',
  'coi_expiring',
  'blank',
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

const STAGE_GUIDANCE: Record<Stage, string> = {
  non_compliant: 'No notice has gone out yet. Legal will decide whether to send a Notice to Cure.',
  notice_to_cure: 'The cure period is running. Watch the deadline on the case.',
  default: 'The cure period has ended. Legal is working on next steps.',
  collections: 'The balance is with collections. No further tenant contact is needed from you.',
  cured: 'The tenant has cured the issue. No further action is needed.',
  closed: 'The case is closed. No further action is needed.',
};

const OWNER_NAMES: Record<Team, string> = { legal: 'Legal', asset_management: 'Asset Management' };

const hi = (f: MergeFields) => (f.recipientName ? `Hi ${f.recipientName},` : 'Hi,');
const close = (f: MergeFields) => `Case ${f.caseId}: ${f.caseLink}\n\nThanks,\nNotice Desk`;
const deadlineOf = (f: MergeFields) => f.deadline ?? 'not set';
const shortOf = (f: MergeFields) => f.deadlineShort ?? 'not set';

export interface Template {
  id: TemplateId;
  label: string;
  trigger: NotificationTrigger;
  render: (f: MergeFields) => Rendered;
}

export const TEMPLATES: readonly Template[] = [
  {
    id: 'deadline_approaching',
    label: 'Cure deadline approaching',
    trigger: 'deadline_approaching',
    render: (f) => ({
      subject: `${f.tenant}, ${f.where}: cure deadline ${shortOf(f)}`,
      body: `${hi(f)}

The Notice to Cure for ${f.tenant} at ${f.where} expires on ${deadlineOf(f)}. The AR balance is ${f.amount}.

Please confirm before then whether the tenant has paid or been in touch. If nothing comes in, Legal will recommend moving the case to Default.

${close(f)}`,
    }),
  },
  {
    id: 'deadline_passed',
    label: 'Cure deadline passed',
    trigger: 'deadline_passed',
    render: (f) => ({
      subject: `${f.tenant}, ${f.where}: cure deadline passed ${shortOf(f)}`,
      body: `${hi(f)}

The cure deadline for ${f.tenant} at ${f.where} was ${deadlineOf(f)} and the case is still in Notice to Cure. The AR balance is ${f.amount}.

Please check whether the tenant has cured and let Legal know. If not, Legal will review moving the case to Default.

${close(f)}`,
    }),
  },
  {
    id: 'stage_changed',
    label: 'Stage changed',
    trigger: 'stage_changed',
    render: (f) => ({
      subject: `${f.tenant}, ${f.where}: now ${f.stage}`,
      body: `${hi(f)}

The case for ${f.tenant} at ${f.where} ${f.previousStage ? `moved from ${f.previousStage} to ${f.stage}` : `is now in ${f.stage}`}. The AR balance is ${f.amount}.

${f.stageGuidance}

${close(f)}`,
    }),
  },
  {
    id: 'owner_changed',
    label: 'Owner changed',
    trigger: 'owner_changed',
    render: (f) => ({
      subject: `${f.tenant}, ${f.where}: now with ${f.owner}`,
      body: `${hi(f)}

The case for ${f.tenant} at ${f.where} is now with ${f.owner}, currently in ${f.stage}. The AR balance is ${f.amount}.

The next step is with ${f.owner}.

${close(f)}`,
    }),
  },
  {
    id: 'coi_expiring',
    label: 'Insurance certificate expiring',
    trigger: 'coi_expiring',
    render: (f) => ({
      subject: `${f.tenant}, ${f.where}: insurance certificate ${f.coiStatus}`,
      body: `${hi(f)}

The insurance certificate for ${f.tenant} at ${f.where} is ${f.coiStatus} (expiry ${f.coiExpiry}).

Please ask the tenant for a renewed certificate.

${close(f)}`,
    }),
  },
  { id: 'blank', label: 'Blank', trigger: 'manual', render: () => ({ subject: '', body: '' }) },
];

export function renderTemplate(id: TemplateId, fields: MergeFields): Rendered {
  const template = TEMPLATES.find((t) => t.id === id);
  if (!template) throw new Error(`Unknown template ${id}`);
  return template.render(fields);
}

export interface FieldSources {
  tenant: Tenant | undefined;
  property: Property | undefined;
  lease: Lease | undefined;
  coi: { status: CoiStatus; expiresOn: ISODate | null } | undefined;
}

export interface FieldOptions {
  /** The stage being described; defaults to the case's current stage. */
  stage?: Stage;
  previousStage?: Stage;
  /** The team named as owner; defaults to the case's owner. */
  owner?: Team;
  deadline?: ISODate | null;
  recipientName?: string | null;
}

export function buildMergeFields(
  c: Case,
  sources: FieldSources,
  options: FieldOptions = {},
): MergeFields {
  const stage = options.stage ?? c.stage;
  const propertyName = sources.property?.name ?? 'an unknown property';
  const suite = sources.lease?.suite;
  const deadline = options.deadline ?? null;
  const balance = sources.lease?.arBalance ?? null;
  return {
    caseId: c.id,
    caseLink: `/cases/${c.id}`,
    tenant: sources.tenant?.displayName ?? 'Unknown tenant',
    property: propertyName,
    where: suite ? `${propertyName}, Suite ${suite}` : propertyName,
    stage: STAGE_LABELS[stage],
    previousStage: options.previousStage ? STAGE_LABELS[options.previousStage] : null,
    stageGuidance: STAGE_GUIDANCE[stage],
    owner: OWNER_NAMES[options.owner ?? c.owner],
    deadline: deadline ? longDate(deadline) : null,
    deadlineShort: deadline ? weekdayDate(deadline) : null,
    amount: balance === null ? 'not available' : formatCents(balance),
    coiStatus: sources.coi ? sources.coi.status.replace('_', ' ') : 'not on file',
    coiExpiry: sources.coi?.expiresOn ? longDate(sources.coi.expiresOn) : 'unknown',
    recipientName: options.recipientName ?? null,
  };
}
