import { STAGE_LABELS, formatCents, longDate, weekdayDate } from '@/lib/format';
import { TEMPLATE_IDS, type TemplateId } from '../types';
import type {
  PersonaKind,
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
  /** What the tenant is told about this stage, in their language. */
  tenantGuidance: string;
  /** What the tenant's message is about, for its subject line. */
  tenantTopic: string;
  /** " The outstanding balance is $X." or nothing when there is no balance to speak of. */
  balanceSentence: string;
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

export { TEMPLATE_IDS, type TemplateId };

const STAGE_GUIDANCE: Record<Stage, string> = {
  non_compliant: 'No notice has gone out yet. Legal will decide whether to send a Notice to Cure.',
  notice_to_cure: 'The cure period is running. Watch the deadline on the case.',
  default: 'The cure period has ended. Legal is working on next steps.',
  collections: 'The balance is with collections. No further tenant contact is needed from you.',
  cured: 'The tenant has cured the issue. No further action is needed.',
  closed: 'The case is closed. No further action is needed.',
};

const TENANT_STAGE_GUIDANCE: Record<Stage, string> = {
  non_compliant:
    'We have noticed an issue at your premises that needs to be addressed. We will be in touch with the details.',
  notice_to_cure:
    'We have issued a formal Notice to Cure. It sets out what needs to be resolved and by when.',
  default:
    'The cure period has ended without the matter being resolved. Our legal team is reviewing the next steps and will be in touch.',
  collections:
    'The outstanding balance has been referred to a collections agency, which will contact you directly.',
  cured: 'Thank you for resolving this matter. No further action is needed.',
  closed: 'This matter is now closed. No further action is needed.',
};

const TENANT_STAGE_TOPIC: Record<Stage, string> = {
  non_compliant: 'an issue at your premises',
  notice_to_cure: 'your Notice to Cure',
  default: 'your lease is now in default',
  collections: 'your balance has gone to collections',
  cured: 'this matter is resolved',
  closed: 'this matter is closed',
};

const OWNER_NAMES: Record<Team, string> = { legal: 'Legal', asset_management: 'Asset Management' };

const hi = (f: MergeFields) => (f.recipientName ? `Hi ${f.recipientName},` : 'Hi,');
const close = (f: MergeFields) => `Case ${f.caseId}: ${f.caseLink}\n\nThanks,\nNotice Desk`;
const deadlineOf = (f: MergeFields) => f.deadline ?? 'not set';
const shortOf = (f: MergeFields) => f.deadlineShort ?? 'not set';

/**
 * Who is reading. Legal (Maya) gets the Notice Desk wording the app has always used; a property
 * manager gets a message for the tenant to pass on; an asset manager gets what is theirs to do;
 * the Founder gets a short heads-up.
 */
export type Audience = PersonaKind;

export interface Template {
  id: TemplateId;
  label: string;
  trigger: NotificationTrigger;
  /** The Notice Desk email to Maya. The wording the app has always used. */
  render: (f: MergeFields) => Rendered;
  /** Written for the tenant, in an email to the property manager who passes it on. */
  renderForProperty: (f: MergeFields) => Rendered;
}

/** The email to the property manager: a short note, then the message for the tenant. */
const forTenant = (f: MergeFields, topic: string, tenantBody: string): Rendered => ({
  subject: `For ${f.tenant}, ${f.where}: ${topic}`,
  body: `${hi(f)}

Please pass the message below on to ${f.tenant}.

Message for the tenant:

Dear ${f.tenant},

${tenantBody}

Sincerely,
Meridian Peak Equity

End of message.

Case ${f.caseId}: ${f.caseLink}

Thanks,
Notice Desk`,
});

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
    renderForProperty: (f) =>
      forTenant(
        f,
        `cure deadline ${shortOf(f)}`,
        `This is a reminder about the notice we sent for ${f.where}. The cure period ends on ${deadlineOf(f)}.${f.balanceSentence}

If you have already resolved this, please let us know so we can update our records. If not, please contact us before ${shortOf(f)} so we can talk it through.`,
      ),
  },
  {
    id: 'deadline_passed',
    label: 'Cure deadline passed',
    trigger: 'deadline_passed',
    render: (f) => ({
      subject: `${f.tenant}, ${f.where}: cure deadline passed ${shortOf(f)}`,
      body: `${hi(f)}

The cure deadline for ${f.tenant} at ${f.where} was ${deadlineOf(f)} and the case is still in Notice to Cure. The AR balance is ${f.amount}.

Please check whether the tenant has cured. If not, consider moving the case to Default.

${close(f)}`,
    }),
    renderForProperty: (f) =>
      forTenant(
        f,
        'cure deadline passed',
        `The cure period in our notice for ${f.where} ended on ${deadlineOf(f)}, and our records show the matter has not yet been resolved.${f.balanceSentence}

Please contact us as soon as possible so we can discuss next steps.`,
      ),
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
    renderForProperty: (f) =>
      forTenant(
        f,
        f.tenantTopic,
        `We are writing to update you on ${f.where}. ${f.tenantGuidance}${f.balanceSentence}

If you have any questions, please contact us.`,
      ),
  },
  {
    id: 'owner_changed',
    label: 'Owner changed',
    trigger: 'owner_changed',
    render: (f) => ({
      subject: `${f.tenant}, ${f.where}: now with ${f.owner}`,
      body: `${hi(f)}

The case for ${f.tenant} at ${f.where} is now with ${f.owner}, currently in ${f.stage}. The AR balance is ${f.amount}.

Please review the case; the next step is yours.

${close(f)}`,
    }),
    renderForProperty: (f) =>
      forTenant(
        f,
        'who is handling your account',
        `Your account for ${f.where} is now being handled by ${f.owner}. If you have any questions about it, please contact us and we will point you to the right person.`,
      ),
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
    renderForProperty: (f) =>
      forTenant(
        f,
        'your insurance certificate',
        `Our records show that the certificate of insurance for ${f.where} is ${f.coiStatus} (expiry ${f.coiExpiry}).

Please send us an updated certificate as soon as you can so that your coverage stays on file.`,
      ),
  },
  {
    id: 'blank',
    label: 'Blank',
    trigger: 'manual',
    render: () => ({ subject: '', body: '' }),
    renderForProperty: () => ({ subject: '', body: '' }),
  },
];

const note = (f: MergeFields, subject: string, paragraphs: string[]): Rendered => ({
  subject: `${f.tenant}, ${f.where}: ${subject}`,
  body: `${hi(f)}\n\n${paragraphs.join('\n\n')}\n\n${close(f)}`,
});

const withAssetManagement = (f: MergeFields) => f.owner === OWNER_NAMES.asset_management;

/** An asset manager: what changed, and what is theirs to do about it. */
const ASSET_MANAGER_COPY: Record<TemplateId, (f: MergeFields) => Rendered> = {
  deadline_approaching: (f) =>
    note(f, `cure deadline ${shortOf(f)}`, [
      `The Notice to Cure for ${f.tenant} at ${f.where} expires on ${deadlineOf(f)}. The AR balance is ${f.amount}.`,
      'Please ask the property manager to reach the tenant before then. If the tenant has paid or agreed a plan, add an update to the case so Legal sees it.',
    ]),
  deadline_passed: (f) =>
    note(f, `cure deadline passed ${shortOf(f)}`, [
      `The cure deadline for ${f.tenant} at ${f.where} was ${deadlineOf(f)} and the case is still in Notice to Cure. The AR balance is ${f.amount}.`,
      'If the tenant has paid or been in touch, add an update to the case now. Otherwise Legal will decide whether to move the case to Default.',
    ]),
  stage_changed: (f) =>
    note(f, `now ${f.stage}`, [
      `The case for ${f.tenant} at ${f.where} ${f.previousStage ? `moved from ${f.previousStage} to ${f.stage}` : `is now in ${f.stage}`}. The AR balance is ${f.amount}.`,
      `${f.stageGuidance} The case is with ${f.owner}.`,
    ]),
  owner_changed: (f) =>
    note(f, `now with ${f.owner}`, [
      `The case for ${f.tenant} at ${f.where} is now with ${f.owner}, currently in ${f.stage}. The AR balance is ${f.amount}.`,
      withAssetManagement(f)
        ? 'It is with you now. Please review it, add an update, and hand it back to Legal when it is ready for them.'
        : 'It is back with Legal. Nothing is needed from you unless the tenant gets in touch.',
    ]),
  coi_expiring: (f) =>
    note(f, `insurance certificate ${f.coiStatus}`, [
      `The insurance certificate for ${f.tenant} at ${f.where} is ${f.coiStatus} (expiry ${f.coiExpiry}).`,
      'Please ask the property manager to collect a renewed certificate from the tenant.',
    ]),
  blank: () => ({ subject: '', body: '' }),
};

/** The Founder: a short heads-up with the numbers, and nothing to action. */
const FOUNDER_COPY: Record<TemplateId, (f: MergeFields) => Rendered> = {
  deadline_approaching: (f) =>
    note(f, `cure deadline ${shortOf(f)}`, [
      `Heads-up: the Notice to Cure for ${f.tenant} at ${f.where} expires on ${deadlineOf(f)}, with ${f.amount} outstanding. The case is with ${f.owner}.`,
    ]),
  deadline_passed: (f) =>
    note(f, `cure deadline passed ${shortOf(f)}`, [
      `Heads-up: the cure deadline for ${f.tenant} at ${f.where} passed on ${deadlineOf(f)} and the case is still in Notice to Cure, with ${f.amount} outstanding. It is with ${f.owner}.`,
    ]),
  stage_changed: (f) =>
    note(f, `now ${f.stage}`, [
      `Heads-up: ${f.tenant} at ${f.where} ${f.previousStage ? `moved from ${f.previousStage} to ${f.stage}` : `is now in ${f.stage}`}, with ${f.amount} outstanding. It is with ${f.owner}.`,
    ]),
  owner_changed: (f) =>
    note(f, `now with ${f.owner}`, [
      `Heads-up: ${f.tenant} at ${f.where} is now with ${f.owner}, in ${f.stage}, with ${f.amount} outstanding.`,
    ]),
  coi_expiring: (f) =>
    note(f, `insurance certificate ${f.coiStatus}`, [
      `Heads-up: the insurance certificate for ${f.tenant} at ${f.where} is ${f.coiStatus} (expiry ${f.coiExpiry}).`,
    ]),
  blank: () => ({ subject: '', body: '' }),
};

export function renderTemplate(
  id: TemplateId,
  fields: MergeFields,
  audience: Audience = 'legal',
): Rendered {
  const template = TEMPLATES.find((t) => t.id === id);
  if (!template) throw new Error(`Unknown template ${id}`);
  switch (audience) {
    case 'legal':
      return template.render(fields);
    case 'property_manager':
      return template.renderForProperty(fields);
    case 'asset_manager':
      return ASSET_MANAGER_COPY[id](fields);
    case 'founder':
      return FOUNDER_COPY[id](fields);
  }
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
    tenantGuidance: TENANT_STAGE_GUIDANCE[stage],
    tenantTopic: TENANT_STAGE_TOPIC[stage],
    balanceSentence:
      balance !== null && balance > 0 ? ` The outstanding balance is ${formatCents(balance)}.` : '',
    owner: OWNER_NAMES[options.owner ?? c.owner],
    deadline: deadline ? longDate(deadline) : null,
    deadlineShort: deadline ? weekdayDate(deadline) : null,
    amount: balance === null ? 'not available' : formatCents(balance),
    coiStatus: sources.coi ? sources.coi.status.replace('_', ' ') : 'not on file',
    coiExpiry: sources.coi?.expiresOn ? longDate(sources.coi.expiresOn) : 'unknown',
    recipientName: options.recipientName ?? null,
  };
}
