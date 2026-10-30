// Runtime mirror of types.ts. schemas.test.ts asserts the two stay in step.
import { z } from 'zod';
import {
  ACTIONS,
  AR_AGINGS,
  COI_STATUSES,
  DQ_ACTIONS,
  DQ_FILES,
  DQ_SEVERITIES,
  ISSUE_TYPES,
  LENDER_NOTICES,
  LEASE_STATUSES,
  NOTIFICATION_SOURCES,
  NOTIFICATION_STATUSES,
  NOTIFICATION_TRIGGERS,
  PERSON_ROLES,
  PERSONA_KINDS,
  PROPERTY_TYPES,
  STAGES,
  TEAMS,
} from './types';

const id = z.string().min(1);
const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });
const cents = z.number().int();
const nonNegativeCents = cents.nonnegative();

export const StageSchema = z.enum(STAGES);
export const TeamSchema = z.enum(TEAMS);
export const IssueTypeSchema = z.enum(ISSUE_TYPES);
export const ArAgingSchema = z.enum(AR_AGINGS);
export const ActionSchema = z.enum(ACTIONS);

export const CurePeriodSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('days'),
    n: z.number().int().positive(),
    unit: z.enum(['calendar', 'business']),
  }),
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('unknown') }),
]);

export const PersonSchema = z.strictObject({
  id,
  name: id,
  roles: z.array(z.enum(PERSON_ROLES)),
});

export const PropertySchema = z.strictObject({
  id,
  name: id,
  aliases: z.array(id),
  type: z.enum(PROPERTY_TYPES),
  city: z.string(),
  state: z.string(),
  market: z.string(),
  fund: z.string(),
  assetManagerId: id.nullable(),
  propertyManagerId: id.nullable(),
  sqFt: z.number().int().nonnegative().nullable(),
  acquiredDate: isoDate.nullable(),
});

export const TenantSchema = z.strictObject({
  id,
  displayName: id,
  nameVariants: z.array(id),
});

export const LeaseSchema = z.strictObject({
  id,
  propertyId: id.nullable(),
  tenantId: id,
  suite: z.string().nullable(),
  sqFt: z.number().int().nonnegative().nullable(),
  status: z.enum(LEASE_STATUSES),
  startDate: isoDate.nullable(),
  endDate: isoDate.nullable(),
  monthlyRent: nonNegativeCents.nullable(),
  arBalance: cents.nullable(),
  arAgingRecorded: ArAgingSchema,
  arAgingImplied: ArAgingSchema.nullable(),
  watchlistReasons: z.array(z.string()),
});

export const CoiRecordSchema = z.strictObject({
  tenantId: id,
  propertyId: id.nullable(),
  leaseIds: z.array(id),
  status: z.enum(COI_STATUSES),
  expiresOn: isoDate.nullable(),
});

export const CaseSchema = z
  .strictObject({
    id,
    leaseId: id.nullable(),
    tenantId: id,
    propertyId: id.nullable(),
    stage: StageSchema,
    issueType: IssueTypeSchema,
    dateSent: isoDate.nullable(),
    curePeriod: CurePeriodSchema,
    owner: TeamSchema,
    amountOwedAtNotice: nonNegativeCents.nullable(),
    legalFeesTerms: z.string().nullable(),
    lenderNotice: z.enum(LENDER_NOTICES).nullable(),
    workflowStatus: z.string().nullable(),
    courtCaseNo: z.string().nullable(),
    guarantorName: z.string().nullable(),
    hasGuarantor: z.boolean(),
  })
  .refine((c) => c.leaseId !== null || c.propertyId === null, {
    message: 'propertyId requires a leaseId',
    path: ['propertyId'],
  })
  .refine((c) => c.guarantorName === null || c.hasGuarantor, {
    message: 'guarantorName requires hasGuarantor',
    path: ['guarantorName'],
  });

const caseEventBase = {
  id,
  caseId: id,
  at: isoDateTime,
  effectiveDate: isoDate,
  actorPersonaId: id,
  note: z.string().optional(),
};

const emptyPayload = z.strictObject({});

export const CaseEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...caseEventBase, type: z.literal('case_opened'), payload: emptyPayload }),
  z.strictObject({ ...caseEventBase, type: z.literal('imported_note'), payload: emptyPayload }),
  z.strictObject({ ...caseEventBase, type: z.literal('note'), payload: emptyPayload }),
  z.strictObject({
    ...caseEventBase,
    type: z.literal('stage_changed'),
    payload: z.strictObject({ from: StageSchema, to: StageSchema }),
  }),
  z.strictObject({
    ...caseEventBase,
    type: z.literal('owner_changed'),
    payload: z.strictObject({ from: TeamSchema, to: TeamSchema }),
  }),
  z.strictObject({
    ...caseEventBase,
    type: z.literal('notification_drafted'),
    payload: z.strictObject({ notificationId: id }),
  }),
  z.strictObject({
    ...caseEventBase,
    type: z.literal('notification_sent'),
    payload: z.strictObject({ notificationId: id }),
  }),
]);

export const NotificationSchema = z.strictObject({
  id,
  caseId: id,
  trigger: z.enum(NOTIFICATION_TRIGGERS),
  dedupeKey: id,
  recipientPersonaId: id.nullable(),
  recipientLabel: id,
  subject: z.string(),
  body: z.string(),
  source: z.enum(NOTIFICATION_SOURCES),
  status: z.enum(NOTIFICATION_STATUSES),
  createdAt: isoDateTime,
  sentAt: isoDateTime.optional(),
});

export const DataQualityIssueSchema = z.strictObject({
  ruleId: id,
  severity: z.enum(DQ_SEVERITIES),
  file: z.enum(DQ_FILES),
  rowRef: id,
  field: id,
  message: id,
  action: z.enum(DQ_ACTIONS),
  before: z.string().optional(),
  after: z.string().optional(),
});

export const PersonaSchema = z.strictObject({
  id,
  label: id,
  kind: z.enum(PERSONA_KINDS),
  personId: id.nullable(),
  team: TeamSchema.nullable(),
  scopePropertyIds: z.union([z.literal('all'), z.array(id)]),
});

export const GuarantorSchema = z.strictObject({ caseId: id, name: id });

/** `dataAsOf` is the export date: the default asOf for the app. */
export const SeedMetaSchema = z.strictObject({
  source: z.enum(['fixture', 'ingest']),
  dataAsOf: isoDate,
});

export const SeedSchema = z.strictObject({
  meta: SeedMetaSchema,
  properties: z.array(PropertySchema),
  people: z.array(PersonSchema),
  tenants: z.array(TenantSchema),
  leases: z.array(LeaseSchema),
  cases: z.array(CaseSchema),
  events: z.array(CaseEventSchema),
  coi: z.array(CoiRecordSchema),
  guarantors: z.array(GuarantorSchema),
});
export type Seed = z.infer<typeof SeedSchema>;

export const DataQualityReportSchema = z.array(DataQualityIssueSchema);
