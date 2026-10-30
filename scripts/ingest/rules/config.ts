// Thresholds and spelling tables for the data-quality rules. Tune here, not in the rules.
import type {
  ArAging,
  CoiStatus,
  IssueType,
  LeaseStatus,
  LenderNotice,
  PropertyType,
  Stage,
  Team,
} from '@/domain/types';
export { AR_FLOOR_THRESHOLDS } from '@/domain/aging';

/** DQ-AMOUNT: a notice amount is drift when it differs from the live balance by either. */
export const AMOUNT_DRIFT = { fraction: 0.05, cents: 50_000 } as const;

/** DQ-TENANT: names this close after normalizing are flagged for review, never merged. */
export const NEAR_MATCH_MAX_DISTANCE = 2;

/** Entity suffixes and filler dropped when comparing tenant names. */
export const ENTITY_SUFFIXES = [
  'llc',
  'l l c',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'co',
  'company',
  'ltd',
  'lp',
  'l p',
  'llp',
] as const;

/**
 * Each table maps a normalized spelling (lowercase, single spaces) to a value. A spelling in
 * `standard` is what the source systems export; anything else that still maps is reported as a
 * fix (DQ-ENUM), and anything unmapped is reported as unknown.
 */
export interface EnumTable<T extends string> {
  /** Spellings the source systems actually emit. */
  standard: Record<string, T>;
  /** Other spellings we recognise. */
  aliases: Record<string, T>;
}

export const STAGE_TABLE: EnumTable<Stage> = {
  standard: {
    'non-compliant': 'non_compliant',
    'notice to cure': 'notice_to_cure',
    default: 'default',
    collections: 'collections',
    cured: 'cured',
    closed: 'closed',
  },
  aliases: {
    'non compliant': 'non_compliant',
    noncompliant: 'non_compliant',
    'notice of cure': 'notice_to_cure',
    ntc: 'notice_to_cure',
    'in default': 'default',
    collection: 'collections',
    cure: 'cured',
    close: 'closed',
  },
};

export const OWNER_TABLE: EnumTable<Team> = {
  standard: { legal: 'legal', am: 'asset_management' },
  aliases: {
    'asset management': 'asset_management',
    'asset mgmt': 'asset_management',
    'asset manager': 'asset_management',
    'legal team': 'legal',
  },
};

export const ISSUE_TYPE_TABLE: EnumTable<IssueType> = {
  standard: {
    monetary: 'monetary',
    insurance: 'insurance',
    breach: 'other_lease_term',
  },
  aliases: {
    rent: 'monetary',
    payment: 'monetary',
    coi: 'insurance',
    other: 'other_lease_term',
    'other lease term': 'other_lease_term',
    nonmonetary: 'other_lease_term',
    'non-monetary': 'other_lease_term',
  },
};

export const AR_AGING_TABLE: EnumTable<ArAging> = {
  standard: {
    current: 'current',
    '0-30': '1_30',
    '31-60': '31_60',
    '61-90': '61_90',
    '90+': '90_plus',
  },
  aliases: {
    '1-30': '1_30',
    '90 plus': '90_plus',
    '90+ days': '90_plus',
    '91+': '90_plus',
    '> 90': '90_plus',
  },
};

export const LEASE_STATUS_TABLE: EnumTable<LeaseStatus> = {
  standard: {
    current: 'active',
    holdover: 'holdover',
    terminated: 'terminated',
    expired: 'expired',
  },
  aliases: { active: 'active', 'hold over': 'holdover', 'month to month': 'holdover' },
};

export const COI_STATUS_TABLE: EnumTable<CoiStatus> = {
  standard: {
    current: 'valid',
    expiring: 'expiring',
    expired: 'expired',
    'non-compliant': 'non_compliant',
  },
  aliases: {
    valid: 'valid',
    'non compliant': 'non_compliant',
    noncompliant: 'non_compliant',
    missing: 'missing',
    none: 'missing',
    'no coi': 'missing',
  },
};

export const PROPERTY_TYPE_TABLE: EnumTable<PropertyType> = {
  standard: { retail: 'retail', industrial: 'industrial', office: 'office' },
  aliases: { other: 'other', 'mixed use': 'other', 'mixed-use': 'other' },
};

export const LENDER_NOTICE_TABLE: EnumTable<LenderNotice> = {
  standard: {
    no: 'none',
    'yes, notice only': 'notice_only',
    'yes, consent & notice': 'consent_and_notice',
  },
  aliases: {
    none: 'none',
    n: 'none',
    'notice only': 'notice_only',
    'consent and notice': 'consent_and_notice',
    'yes, consent and notice': 'consent_and_notice',
  },
};

/**
 * DQ-STAGE: a workflow status that names an end state must agree with the stage.
 * Maps the normalized status to the stages it is consistent with.
 */
export const STATUS_IMPLIES_STAGE: Record<string, readonly Stage[]> = {
  cured: ['cured'],
  closed: ['closed'],
  'collections settled': ['closed', 'collections'],
  'in collections': ['collections'],
};
