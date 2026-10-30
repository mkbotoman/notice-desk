/** Plain-English copy for every ingest rule, in the order of docs/DATA_QUALITY_RULES.md. */
export interface DataQualityRule {
  id: string;
  title: string;
  /** What the rule looks at. */
  checks: string;
  /** What the app did when it found something. */
  response: string;
}

export const DATA_QUALITY_RULES: readonly DataQualityRule[] = [
  {
    id: 'DQ-DATE',
    title: 'Dates',
    checks:
      'Dates not written as year-month-day (04/09/2026, 9/28/26, "Sept 28 2026", spreadsheet serial numbers), and leases that end before they start.',
    response:
      'Converted to one standard format. A date that cannot be read is left empty and flagged. Slash dates are read month-first; the export had no value above 12 in the first position.',
  },
  {
    id: 'DQ-MONEY',
    title: 'Money amounts',
    checks: 'Amounts written with $, commas or brackets, or as text such as "Pending".',
    response:
      'Converted to cents. Text, or a negative where none is allowed, is left empty and flagged. Tenant credits (negative balances) are allowed.',
  },
  {
    id: 'DQ-ENUM',
    title: 'Spellings of fixed choices',
    checks:
      'Different spellings of type, stage, owner, lease status, insurance status, aging and lender notice.',
    response:
      'Known spellings pass silently and recognised aliases are mapped. An unknown value falls back to a default and is flagged. A notice with no usable stage is dropped.',
  },
  {
    id: 'DQ-TENANT',
    title: 'Tenant names',
    checks: 'The same tenant written several ways across the files.',
    response:
      'Names that match after ignoring case, punctuation, "LLC"-style endings, "dba" and a leading "The" are merged. Names that are only close are flagged, not merged. A row with no tenant name is dropped. A notice naming a different tenant than its lease uses the lease\'s tenant.',
  },
  {
    id: 'DQ-PROP',
    title: 'Property names on notices',
    checks: "A notice that names its property differently from the lease's property.",
    response:
      "The lease's property is trusted and the notice's wording is kept as an alias. Routine when it looks like an abbreviation, a warning when it does not.",
  },
  {
    id: 'DQ-ORPHAN',
    title: 'Records with a missing link',
    checks:
      'A lease with an unknown property, a notice with an unknown lease, or an insurance row with no property or no matching lease.',
    response:
      'Kept without the missing link and flagged. Leases with no property show under "Unknown property" and are visible only to people who see every property.',
  },
  {
    id: 'DQ-DUP',
    title: 'Duplicate or missing keys',
    checks: 'Two rows with the same id, or a row with no id.',
    response:
      'The most complete row is kept and the others are dropped. A row with no id is dropped.',
  },
  {
    id: 'DQ-STAGE',
    title: 'Stage against status',
    checks:
      'A status that names an end state (Cured, Closed, In Collections, Collections Settled) that disagrees with the stage.',
    response: 'The stage wins and the disagreement is flagged.',
  },
  {
    id: 'DQ-CURE',
    title: 'Cure periods',
    checks: 'Cure periods that are blank, unreadable, or a day count with no unit.',
    response:
      'Blank on a sent notice, or unreadable, becomes "unknown" and is flagged: a missing deadline, not "no deadline". Blank on an unsent notice means none. A bare day count is read as calendar days. A cure period with no send date is flagged.',
  },
  {
    id: 'DQ-AMOUNT',
    title: 'Notice amount against balance',
    checks: 'A notice amount that differs from the lease balance by more than 5% or $500.',
    response: 'Both numbers are kept and the difference is flagged.',
  },
  {
    id: 'DQ-COI',
    title: 'Insurance status against expiry',
    checks: "An insurance status that disagrees with the certificate's expiry date.",
    response:
      'The exported status is kept, and the app works out the real status from the expiry date and the as-of date. Flagged.',
  },
  {
    id: 'DQ-COI-MISSING',
    title: 'Leases with no insurance row',
    checks: 'A lease the insurance tool has no certificate for.',
    response:
      'A "missing" certificate is recorded. It counts as an insurance warning sign on the watchlist. Flagged.',
  },
  {
    id: 'DQ-AR',
    title: 'Rent aging against balance',
    checks: 'Aging that looks better than the balance allows, or stale on a zero balance.',
    response:
      'The balance gives a floor: with n charges open, the oldest is at least n - 1 months old. Aging better than that floor is an error. Aging that is worse than the balance suggests is never flagged, because part-payments lower the balance.',
  },
  {
    id: 'DQ-SUITE',
    title: 'Shared suites',
    checks: 'Two leases on the same property and suite.',
    response: 'Both are kept and flagged for a person to look at.',
  },
  {
    id: 'DQ-NOTE',
    title: 'Update notes',
    checks: 'Notice updates that do not follow the "date - text; date - text" pattern.',
    response: 'Kept as one note dated on the day the notice was sent, and flagged.',
  },
  {
    id: 'DQ-PII',
    title: 'Sensitive data',
    checks: 'SSN-shaped text, or digits after an account keyword, in free-text notes.',
    response:
      'Redacted before saving; only the count is logged. The guarantor SSN column is removed when the file is read and never stored.',
  },
];
