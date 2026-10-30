// Frozen contracts. Changes go through the integrator, not feature work.
// Every enum is declared once as a const tuple so schemas.ts reuses the same values.

/** Calendar date, 'YYYY-MM-DD'. */
export type ISODate = string;
/** Instant, ISO 8601 with offset, e.g. '2026-10-30T16:48:41.143Z'. */
export type ISODateTime = string;
/** Integer cents. Balances may be negative (tenant credit); fees and rent may not. */
export type Cents = number;

export const PROPERTY_TYPES = ['retail', 'industrial', 'office', 'other'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const TEAMS = ['legal', 'asset_management'] as const;
export type Team = (typeof TEAMS)[number];

export const STAGES = [
  'non_compliant',
  'notice_to_cure',
  'default',
  'collections',
  'cured',
  'closed',
] as const;
export type Stage = (typeof STAGES)[number];

export const ISSUE_TYPES = ['monetary', 'insurance', 'other_lease_term'] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const AR_AGINGS = ['current', '1_30', '31_60', '61_90', '90_plus', 'unknown'] as const;
export type ArAging = (typeof AR_AGINGS)[number];

export const LEASE_STATUSES = ['active', 'expired', 'terminated', 'holdover', 'unknown'] as const;
export type LeaseStatus = (typeof LEASE_STATUSES)[number];

export const COI_STATUSES = [
  'valid',
  'expiring',
  'expired',
  'non_compliant',
  'missing',
  'unknown',
] as const;
export type CoiStatus = (typeof COI_STATUSES)[number];

export const LENDER_NOTICES = ['none', 'notice_only', 'consent_and_notice'] as const;
export type LenderNotice = (typeof LENDER_NOTICES)[number];

export const PERSON_ROLES = ['asset_manager', 'property_manager'] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

/**
 * `unknown` means a cure period was present but could not be parsed (or is missing on a
 * notice_to_cure case). It is distinct from `none` (the notice genuinely has no cure date) so
 * an unreadable deadline is surfaced as "deadline missing" instead of sinking to the bottom.
 */
export type CurePeriod =
  | { kind: 'days'; n: number; unit: 'calendar' | 'business' }
  | { kind: 'none' }
  | { kind: 'unknown' };

export interface Person {
  id: string;
  name: string;
  roles: PersonRole[];
}

export interface Property {
  id: string;
  name: string;
  aliases: string[];
  type: PropertyType;
  city: string;
  state: string;
  market: string;
  fund: string;
  assetManagerId: string | null;
  propertyManagerId: string | null;
  sqFt: number | null;
  acquiredDate: ISODate | null;
}

/** Derived by ingest; the source files carry no tenant ID. */
export interface Tenant {
  id: string;
  displayName: string;
  nameVariants: string[];
}

export interface Lease {
  id: string;
  /** Null when the source names a property that does not exist (rule DQ-ORPHAN). */
  propertyId: string | null;
  tenantId: string;
  suite: string | null;
  sqFt: number | null;
  status: LeaseStatus;
  startDate: ISODate | null;
  endDate: ISODate | null;
  monthlyRent: Cents | null;
  arBalance: Cents | null;
  /** As exported. */
  arAgingRecorded: ArAging;
  /**
   * The best aging the balance allows (rule DQ-AR floor): the oldest open charge is at least
   * (open charges - 1) months old. Null when rent is missing or zero.
   */
  arAgingImplied: ArAging | null;
  watchlistReasons: string[];
}

/** `status: 'missing'` with `expiresOn: null` is synthesized for leases the COI tool has no row for. */
export interface CoiRecord {
  tenantId: string;
  propertyId: string | null;
  leaseIds: string[];
  status: CoiStatus;
  expiresOn: ISODate | null;
}

/** One per notice row. `id` is the source notice_id. */
export interface Case {
  id: string;
  /** Null for an orphan notice whose lease_id is not in leases (rule DQ-ORPHAN). */
  leaseId: string | null;
  tenantId: string;
  /** Null when leaseId is null, or when the lease itself has no property. */
  propertyId: string | null;
  stage: Stage;
  issueType: IssueType;
  dateSent: ISODate | null;
  curePeriod: CurePeriod;
  owner: Team;
  /** Snapshot from Legal's sheet; the live figure is lease.arBalance. */
  amountOwedAtNotice: Cents | null;
  /** Whether the lease lets Legal recover fees, verbatim from the sheet (e.g. 'Yes, Section 18.4'). */
  legalFeesTerms: string | null;
  lenderNotice: LenderNotice | null;
  /** Legal's working status, verbatim (e.g. 'Hold per AM'). Not the stage. */
  workflowStatus: string | null;
  courtCaseNo: string | null;
  /** Never an SSN. Held apart from the case so it can be removed per person. */
  guarantorName: string | null;
  hasGuarantor: boolean;
}

export const CASE_EVENT_TYPES = [
  'case_opened',
  'imported_note',
  'note',
  'stage_changed',
  'owner_changed',
  'notification_drafted',
  'notification_sent',
] as const;
export type CaseEventType = (typeof CASE_EVENT_TYPES)[number];

interface CaseEventBase {
  id: string;
  caseId: string;
  /** When the event was recorded. */
  at: ISODateTime;
  /** When it happened, as far as the business is concerned. */
  effectiveDate: ISODate;
  actorPersonaId: string | 'import';
  note?: string;
}

export type CaseEvent = CaseEventBase &
  (
    | { type: 'case_opened'; payload: Record<string, never> }
    | { type: 'imported_note'; payload: Record<string, never> }
    | { type: 'note'; payload: Record<string, never> }
    | { type: 'stage_changed'; payload: { from: Stage; to: Stage } }
    | { type: 'owner_changed'; payload: { from: Team; to: Team } }
    | { type: 'notification_drafted'; payload: { notificationId: string } }
    | { type: 'notification_sent'; payload: { notificationId: string } }
  );

export const NOTIFICATION_TRIGGERS = [
  'deadline_approaching',
  'deadline_passed',
  'stage_changed',
  'owner_changed',
  'coi_expiring',
  'manual',
] as const;
export type NotificationTrigger = (typeof NOTIFICATION_TRIGGERS)[number];

export const NOTIFICATION_SOURCES = ['template', 'ai_draft', 'manual'] as const;
export type NotificationSource = (typeof NOTIFICATION_SOURCES)[number];

export const NOTIFICATION_STATUSES = ['draft', 'sent', 'dismissed'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export interface Notification {
  id: string;
  caseId: string;
  trigger: NotificationTrigger;
  /**
   * Prevents the same automatic trigger firing twice. Deadline triggers use
   * `${caseId}:${trigger}:${deadline}`; stage and owner changes use the originating event id.
   * Manual notifications use their own id.
   */
  dedupeKey: string;
  recipientPersonaId: string | null;
  recipientLabel: string;
  subject: string;
  body: string;
  source: NotificationSource;
  status: NotificationStatus;
  createdAt: ISODateTime;
  sentAt?: ISODateTime;
}

export const DQ_SEVERITIES = ['error', 'warning', 'info'] as const;
export type DataQualitySeverity = (typeof DQ_SEVERITIES)[number];

export const DQ_FILES = ['properties', 'leases', 'notices', 'coi'] as const;
export type DataQualityFile = (typeof DQ_FILES)[number];

export const DQ_ACTIONS = ['fixed', 'flagged', 'dropped'] as const;
export type DataQualityAction = (typeof DQ_ACTIONS)[number];

export interface DataQualityIssue {
  ruleId: string;
  severity: DataQualitySeverity;
  file: DataQualityFile;
  /** A record id or row number. Never a raw row. */
  rowRef: string;
  field: string;
  message: string;
  action: DataQualityAction;
  before?: string;
  after?: string;
}

export const PERSONA_KINDS = ['legal', 'asset_manager', 'property_manager', 'founder'] as const;
export type PersonaKind = (typeof PERSONA_KINDS)[number];

/** No login. Selected in the header, persisted, and deep-linkable with ?as=<id>. */
export interface Persona {
  id: string;
  label: string;
  kind: PersonaKind;
  /** The Person this persona represents; null for Legal and Founder. */
  personId: string | null;
  /** The team whose court this persona answers for; null when none (founder, property manager). */
  team: Team | null;
  scopePropertyIds: string[] | 'all';
}

export const ACTIONS = [
  'view_case',
  'edit_case',
  'advance_stage',
  'change_owner',
  'add_update',
  'send_notification',
  'view_guarantor',
  'view_analytics',
  'view_data_quality',
] as const;
export type Action = (typeof ACTIONS)[number];

export type CanFn = (persona: Persona, action: Action, caseRecord?: Case) => boolean;
