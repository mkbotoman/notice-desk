import { checkAging } from '@/domain/aging';
import { effectiveCoiStatus } from '@/domain/coi';
import { parseCurePeriod } from '@/domain/cure';
import { SeedSchema, type Seed } from '@/domain/schemas';
import type {
  Case,
  CaseEvent,
  CoiRecord,
  CoiStatus,
  CurePeriod,
  DataQualityFile,
  DataQualityIssue,
  ISODate,
  Lease,
  Person,
  Property,
} from '@/domain/types';
import { parseCsv, type Row } from './csv';
import { IssueLog } from './issues';
import { parseUpdates } from './notes';
import {
  isBlank,
  isPlausibleAlias,
  mapEnum,
  normalizeName,
  parseDate,
  parseMoney,
  redactPii,
  slug,
} from './normalize';
import {
  AMOUNT_DRIFT,
  AR_AGING_TABLE,
  COI_STATUS_TABLE,
  ISSUE_TYPE_TABLE,
  LEASE_STATUS_TABLE,
  LENDER_NOTICE_TABLE,
  OWNER_TABLE,
  PROPERTY_TYPE_TABLE,
  STAGE_TABLE,
  STATUS_IMPLIES_STAGE,
  type EnumTable,
} from './rules/config';
import { buildTenantRegistry } from './tenants';

export interface RawCsv {
  properties: string;
  leases: string;
  notices: string;
  coi: string;
}

/** Columns each file must have. A missing one means the wrong file or a changed export. */
export const REQUIRED_COLUMNS = {
  properties: [
    'property_id',
    'name',
    'type',
    'city',
    'state',
    'market',
    'fund',
    'asset_manager',
    'property_manager',
    'sq_ft',
    'acquired_date',
  ],
  leases: [
    'lease_id',
    'property_id',
    'tenant_name',
    'suite',
    'sq_ft',
    'lease_status',
    'start_date',
    'end_date',
    'monthly_rent',
    'ar_balance',
    'ar_aging',
    'watchlist_reasons',
  ],
  notices: [
    'notice_id',
    'lease_id',
    'tenant_name',
    'property_name',
    'stage',
    'status',
    'type_of_default',
    'date_sent',
    'cure_period',
    'lender_notice',
    'legal_fees',
    'owner',
    'amount_owed',
    'case_no',
    'guarantor_name',
    'updates',
  ],
  coi: ['tenant_name', 'property_id', 'coi_status', 'expires_on'],
} as const;

function load(
  file: keyof typeof REQUIRED_COLUMNS,
  csv: string,
  sensitive: readonly string[] = [],
): Row[] {
  const { rows, columns } = parseCsv(csv, sensitive);
  const missing = REQUIRED_COLUMNS[file].filter((c) => !columns.includes(c));
  if (missing.length > 0) {
    throw new Error(`${file} CSV is missing column(s): ${missing.join(', ')}`);
  }
  return rows;
}

export interface IngestResult {
  seed: Seed;
  issues: DataQualityIssue[];
}

const text = (raw: string | undefined): string => (raw ?? '').trim();
const orNull = (raw: string | undefined): string | null => (isBlank(raw) ? null : text(raw));
const byId = <T extends { id: string }>(a: T, b: T) =>
  a.id.localeCompare(b.id, undefined, { numeric: true });
const byColumn = (column: string) => (a: Row, b: Row) =>
  text(a[column]).localeCompare(text(b[column]), undefined, { numeric: true });

/** Rows with the same key collapse to the most complete one; keyless rows are dropped. */
function dedupe(
  rows: Row[],
  file: DataQualityFile,
  keyOf: (row: Row) => string,
  refOf: (row: Row, index: number) => string,
  log: IssueLog,
): Row[] {
  const filled = (row: Row) => Object.values(row).filter((v) => !isBlank(v)).length;
  const groups = new Map<string, { row: Row; index: number }[]>();
  rows.forEach((row, index) => {
    const key = keyOf(row);
    if (key === '') {
      log.add({
        ruleId: 'DQ-DUP',
        severity: 'error',
        file,
        rowRef: refOf(row, index),
        field: 'id',
        message: 'Row has no key, so it was dropped.',
        action: 'dropped',
      });
      return;
    }
    groups.set(key, [...(groups.get(key) ?? []), { row, index }]);
  });

  const kept: { row: Row; index: number }[] = [];
  for (const group of groups.values()) {
    const best = group.reduce((a, b) => (filled(b.row) > filled(a.row) ? b : a));
    kept.push(best);
    for (const dropped of group.filter((g) => g !== best)) {
      log.add({
        ruleId: 'DQ-DUP',
        severity: 'warning',
        file,
        rowRef: refOf(dropped.row, dropped.index),
        field: 'id',
        message: 'Duplicate key. Kept the most complete row and dropped this one.',
        action: 'dropped',
      });
    }
  }
  return kept.sort((a, b) => a.index - b.index).map((k) => k.row);
}

export function ingest(raw: RawCsv): IngestResult {
  const log = new IssueLog();

  // ---------- field helpers: each fix or flag becomes an issue ----------

  const dateOf = (file: DataQualityFile, ref: string, field: string, value: string) => {
    if (isBlank(value)) return null;
    const parsed = parseDate(value);
    if (!parsed) {
      log.add({
        ruleId: 'DQ-DATE',
        severity: 'warning',
        file,
        rowRef: ref,
        field,
        message: 'Date could not be read and was left empty.',
        action: 'flagged',
        before: text(value),
      });
      return null;
    }
    if (!parsed.standard) {
      log.add({
        ruleId: 'DQ-DATE',
        severity: 'info',
        file,
        rowRef: ref,
        field,
        message: 'Date converted to ISO format.',
        action: 'fixed',
        before: text(value),
        after: parsed.iso,
      });
    }
    return parsed.iso;
  };

  const moneyOf = (
    file: DataQualityFile,
    ref: string,
    field: string,
    value: string,
    allowNegative = false,
  ) => {
    const parsed = parseMoney(value);
    if (parsed.kind === 'blank') return null;
    if (parsed.kind === 'text' || (parsed.cents < 0 && !allowNegative)) {
      log.add({
        ruleId: 'DQ-MONEY',
        severity: 'warning',
        file,
        rowRef: ref,
        field,
        message:
          parsed.kind === 'text'
            ? 'Not an amount, so it was left empty.'
            : 'Negative amount where none is allowed, so it was left empty.',
        action: 'flagged',
        before: text(value),
      });
      return null;
    }
    if (!parsed.standard) {
      log.add({
        ruleId: 'DQ-MONEY',
        severity: 'info',
        file,
        rowRef: ref,
        field,
        message: 'Amount converted to cents.',
        action: 'fixed',
        before: text(value),
        after: String(parsed.cents),
      });
    }
    return parsed.cents;
  };

  /** Blank returns the fallback quietly; an unmapped spelling returns it with a flag. */
  const enumOf = <T extends string, F extends T | null>(
    file: DataQualityFile,
    ref: string,
    field: string,
    value: string,
    table: EnumTable<T>,
    fallback: F,
  ): T | F => {
    const result = mapEnum(value, table);
    if (result.status === 'blank') return fallback;
    if (result.status === 'unknown') {
      log.add({
        ruleId: 'DQ-ENUM',
        severity: 'warning',
        file,
        rowRef: ref,
        field,
        message: 'Unrecognised value; used the fallback.',
        action: 'flagged',
        before: text(value),
        after: fallback ?? 'empty',
      });
      return fallback;
    }
    if (result.status === 'alias') {
      log.add({
        ruleId: 'DQ-ENUM',
        severity: 'info',
        file,
        rowRef: ref,
        field,
        message: 'Non-standard spelling mapped to its value.',
        action: 'fixed',
        before: text(value),
        after: result.value,
      });
    }
    return result.value;
  };

  /** Free text goes through PII redaction; only the count is logged. */
  const safeText = (file: DataQualityFile, ref: string, field: string, value: string) => {
    const { text: clean, count } = redactPii(text(value));
    if (count > 0) {
      log.add({
        ruleId: 'DQ-PII',
        severity: 'warning',
        file,
        rowRef: ref,
        field,
        message: `Redacted ${count} sensitive value${count === 1 ? '' : 's'} before saving.`,
        action: 'fixed',
      });
    }
    return clean === '' ? null : clean;
  };

  // ---------- cure period ----------

  function cureOf(
    id: string,
    rawCure: string,
    dateSent: ISODate | null,
    stage: Case['stage'],
  ): CurePeriod {
    const parsed = parseCurePeriod(rawCure);
    if (isBlank(rawCure)) {
      if (dateSent !== null) {
        log.add({
          ruleId: 'DQ-CURE',
          severity: 'warning',
          file: 'notices',
          rowRef: id,
          field: 'cure_period',
          message: 'Notice was sent but has no cure period. The deadline is missing.',
          action: 'flagged',
        });
        return { kind: 'unknown' };
      }
      return { kind: 'none' };
    }
    if (parsed.kind === 'unknown') {
      log.add({
        ruleId: 'DQ-CURE',
        severity: 'warning',
        file: 'notices',
        rowRef: id,
        field: 'cure_period',
        message: 'Cure period could not be read. The deadline is missing.',
        action: 'flagged',
        before: text(rawCure),
      });
      return parsed;
    }
    if (parsed.kind === 'days') {
      if (parsed.unit === 'calendar' && !/calendar|cal|consecutive|cd/i.test(rawCure)) {
        log.add({
          ruleId: 'DQ-CURE',
          severity: 'info',
          file: 'notices',
          rowRef: id,
          field: 'cure_period',
          message: 'No day type given. Assumed calendar days.',
          action: 'fixed',
          before: text(rawCure),
          after: `${parsed.n} calendar days`,
        });
      }
      if (dateSent === null && stage !== 'non_compliant') {
        log.add({
          ruleId: 'DQ-CURE',
          severity: 'warning',
          file: 'notices',
          rowRef: id,
          field: 'date_sent',
          message: 'Cure period given but no send date, so no deadline can be calculated.',
          action: 'flagged',
        });
      }
    }
    return parsed;
  }

  /** A row with no tenant name can't be attached to anyone, so it is dropped and reported. */
  const withTenant = (rows: Row[], file: DataQualityFile, refOf: (row: Row) => string): Row[] =>
    rows.filter((row) => {
      if (!isBlank(row.tenant_name)) return true;
      log.add({
        ruleId: 'DQ-TENANT',
        severity: 'error',
        file,
        rowRef: refOf(row),
        field: 'tenant_name',
        message: 'Tenant name is missing, so the row was dropped.',
        action: 'dropped',
      });
      return false;
    });

  // ---------- parse and de-duplicate ----------

  const propertyRows = dedupe(
    load('properties', raw.properties),
    'properties',
    (r) => text(r.property_id),
    (r, i) => text(r.property_id) || `row ${i + 1}`,
    log,
  );
  const leaseRows = withTenant(
    dedupe(
      load('leases', raw.leases),
      'leases',
      (r) => text(r.lease_id),
      (r, i) => text(r.lease_id) || `row ${i + 1}`,
      log,
    ),
    'leases',
    (r) => text(r.lease_id),
  ).sort(byColumn('lease_id'));
  const noticeRows = withTenant(
    dedupe(
      load('notices', raw.notices, ['guarantor_ssn']),
      'notices',
      (r) => text(r.notice_id),
      (r, i) => text(r.notice_id) || `row ${i + 1}`,
      log,
    ),
    'notices',
    (r) => text(r.notice_id),
  ).sort(byColumn('notice_id'));
  const coiRows = dedupe(
    load('coi', raw.coi),
    'coi',
    (r) => (isBlank(r.tenant_name) ? '' : `${normalizeName(r.tenant_name)}|${text(r.property_id)}`),
    (_r, i) => `row ${i + 1}`,
    log,
  );

  // ---------- tenants ----------

  const registry = buildTenantRegistry([
    ...leaseRows.map((r) => text(r.tenant_name)),
    ...noticeRows.map((r) => text(r.tenant_name)),
    ...coiRows.map((r) => text(r.tenant_name)),
  ]);

  const tenantRename = (file: DataQualityFile, ref: string, rawName: string) => {
    const id = registry.idFor(rawName);
    const display = registry.displayNameOf(id);
    if (text(rawName) !== display) {
      log.add({
        ruleId: 'DQ-TENANT',
        severity: 'info',
        file,
        rowRef: ref,
        field: 'tenant_name',
        message: 'Name variant merged into one tenant.',
        action: 'fixed',
        before: text(rawName),
        after: display,
      });
    }
    return id;
  };

  for (const [a, b] of registry.nearMatches) {
    log.add({
      ruleId: 'DQ-TENANT',
      severity: 'warning',
      file: 'leases',
      rowRef: `${a.id}~${b.id}`,
      field: 'tenant_name',
      message: 'Two tenant names are nearly identical. Not merged; please review.',
      action: 'flagged',
      before: a.displayName,
      after: b.displayName,
    });
  }

  // ---------- properties and people ----------

  const people = new Map<string, Person>();
  const personFor = (rawName: string, role: 'asset_manager' | 'property_manager') => {
    if (isBlank(rawName)) return null;
    const name = text(rawName).replace(/\s+/g, ' ');
    const id = `PER-${slug(name)}`;
    const person = people.get(id) ?? { id, name, roles: [] };
    if (!person.roles.includes(role)) person.roles.push(role);
    people.set(id, person);
    return id;
  };

  const properties = new Map<string, Property>();
  for (const row of propertyRows) {
    const id = text(row.property_id);
    const sqFt = moneyOf('properties', id, 'sq_ft', text(row.sq_ft).replace(/,/g, ''));
    properties.set(id, {
      id,
      name: text(row.name),
      aliases: [],
      type: enumOf('properties', id, 'type', row.type, PROPERTY_TYPE_TABLE, 'other'),
      city: text(row.city),
      state: text(row.state),
      market: text(row.market),
      fund: text(row.fund),
      assetManagerId: personFor(row.asset_manager, 'asset_manager'),
      propertyManagerId: personFor(row.property_manager, 'property_manager'),
      sqFt: sqFt === null ? null : Math.round(sqFt / 100),
      acquiredDate: dateOf('properties', id, 'acquired_date', row.acquired_date),
    });
  }

  // ---------- leases ----------

  const leases: Lease[] = [];
  const suiteOwners = new Map<string, string>();
  for (const row of leaseRows) {
    const id = text(row.lease_id);
    const tenantId = tenantRename('leases', id, row.tenant_name);

    const rawProperty = text(row.property_id);
    const propertyId = properties.has(rawProperty) ? rawProperty : null;
    if (propertyId === null) {
      log.add({
        ruleId: 'DQ-ORPHAN',
        severity: 'warning',
        file: 'leases',
        rowRef: id,
        field: 'property_id',
        message: 'Lease points at a property that does not exist. Kept without a property.',
        action: 'flagged',
        before: rawProperty || 'empty',
      });
    }

    const suite = orNull(row.suite);
    if (propertyId !== null && suite !== null) {
      const suiteKey = `${propertyId}|${suite.toLowerCase()}`;
      const other = suiteOwners.get(suiteKey);
      if (other) {
        log.add({
          ruleId: 'DQ-SUITE',
          severity: 'warning',
          file: 'leases',
          rowRef: id,
          field: 'suite',
          message: `Same property and suite as lease ${other}. Both kept; please review.`,
          action: 'flagged',
        });
      } else {
        suiteOwners.set(suiteKey, id);
      }
    }

    const startDate = dateOf('leases', id, 'start_date', row.start_date);
    const endDate = dateOf('leases', id, 'end_date', row.end_date);
    if (startDate && endDate && endDate < startDate) {
      log.add({
        ruleId: 'DQ-DATE',
        severity: 'warning',
        file: 'leases',
        rowRef: id,
        field: 'end_date',
        message: 'Lease ends before it starts.',
        action: 'flagged',
        before: startDate,
        after: endDate,
      });
    }

    const monthlyRent = moneyOf('leases', id, 'monthly_rent', row.monthly_rent);
    const arBalance = moneyOf('leases', id, 'ar_balance', row.ar_balance, true);
    const arAgingRecorded = enumOf(
      'leases',
      id,
      'ar_aging',
      row.ar_aging,
      AR_AGING_TABLE,
      'unknown',
    );
    const { implied, finding } = checkAging(arAgingRecorded, arBalance, monthlyRent);
    if (finding) {
      log.add({
        ruleId: 'DQ-AR',
        severity: finding.severity,
        file: 'leases',
        rowRef: id,
        field: 'ar_aging',
        message: AGING_MESSAGES[finding.kind],
        action: 'flagged',
        before: arAgingRecorded,
        after: implied ?? undefined,
      });
    }

    const sqFt = moneyOf('leases', id, 'sq_ft', text(row.sq_ft).replace(/,/g, ''));
    leases.push({
      id,
      propertyId,
      tenantId,
      suite,
      sqFt: sqFt === null ? null : Math.round(sqFt / 100),
      status: enumOf('leases', id, 'lease_status', row.lease_status, LEASE_STATUS_TABLE, 'unknown'),
      startDate,
      endDate,
      monthlyRent,
      arBalance,
      arAgingRecorded,
      arAgingImplied: implied,
      watchlistReasons: text(row.watchlist_reasons)
        .split(';')
        .map((reason) => reason.trim())
        .filter(Boolean),
    });
  }
  const leasesById = new Map(leases.map((l) => [l.id, l]));

  // ---------- cases, events and guarantors ----------

  const cases: Case[] = [];
  const guarantors: Seed['guarantors'] = [];
  interface PendingEvent {
    id: string;
    caseId: string;
    date: ISODate | null;
    note: string;
  }
  const pendingEvents: PendingEvent[] = [];

  for (const row of noticeRows) {
    const id = text(row.notice_id);

    const stageResult = mapEnum(row.stage, STAGE_TABLE);
    if (stageResult.status === 'blank' || stageResult.status === 'unknown') {
      log.add({
        ruleId: 'DQ-ENUM',
        severity: 'error',
        file: 'notices',
        rowRef: id,
        field: 'stage',
        message: 'Stage is missing or unrecognised, so the notice was dropped.',
        action: 'dropped',
        before: text(row.stage) || 'empty',
      });
      continue;
    }
    const stage = stageResult.value;
    if (stageResult.status === 'alias') {
      log.add({
        ruleId: 'DQ-ENUM',
        severity: 'info',
        file: 'notices',
        rowRef: id,
        field: 'stage',
        message: 'Non-standard spelling mapped to its value.',
        action: 'fixed',
        before: text(row.stage),
        after: stage,
      });
    }

    // Lease join: trust the lease for tenant and property.
    const lease = leasesById.get(text(row.lease_id));
    if (!lease) {
      log.add({
        ruleId: 'DQ-ORPHAN',
        severity: 'warning',
        file: 'notices',
        rowRef: id,
        field: 'lease_id',
        message: 'Notice points at a lease that does not exist. Kept without a lease.',
        action: 'flagged',
        before: text(row.lease_id) || 'empty',
      });
    }
    const namedTenantId = tenantRename('notices', id, row.tenant_name);
    if (lease && lease.tenantId !== namedTenantId) {
      log.add({
        ruleId: 'DQ-TENANT',
        severity: 'warning',
        file: 'notices',
        rowRef: id,
        field: 'tenant_name',
        message: "Notice names a different tenant than its lease. Used the lease's tenant.",
        action: 'flagged',
        before: text(row.tenant_name),
        after: registry.displayNameOf(lease.tenantId),
      });
    }
    const propertyId = lease?.propertyId ?? null;
    const property = propertyId ? properties.get(propertyId) : undefined;
    if (property && !isBlank(row.property_name)) {
      const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (flat(row.property_name) !== flat(property.name)) {
        const alias = text(row.property_name);
        if (!property.aliases.includes(alias)) property.aliases.push(alias);
        log.add({
          ruleId: 'DQ-PROP',
          severity: isPlausibleAlias(alias, property.name, property.city) ? 'info' : 'warning',
          file: 'notices',
          rowRef: id,
          field: 'property_name',
          message:
            "Notice names the property differently than its lease. Used the lease's property.",
          action: 'flagged',
          before: alias,
          after: property.name,
        });
      }
    }

    // Status vs stage.
    const workflowStatus = safeText('notices', id, 'status', row.status);
    const implied = workflowStatus ? STATUS_IMPLIES_STAGE[workflowStatus.toLowerCase()] : undefined;
    if (implied && !implied.includes(stage)) {
      log.add({
        ruleId: 'DQ-STAGE',
        severity: 'warning',
        file: 'notices',
        rowRef: id,
        field: 'status',
        message: 'Status and stage disagree. Kept the stage.',
        action: 'flagged',
        before: workflowStatus ?? undefined,
        after: stage,
      });
    }

    const dateSent = dateOf('notices', id, 'date_sent', row.date_sent);
    const curePeriod = cureOf(id, row.cure_period, dateSent, stage);

    const amountOwedAtNotice = moneyOf('notices', id, 'amount_owed', row.amount_owed);
    const liveBalance = lease?.arBalance ?? null;
    if (amountOwedAtNotice !== null && liveBalance !== null) {
      const diff = Math.abs(amountOwedAtNotice - liveBalance);
      const limit = Math.abs(liveBalance) * AMOUNT_DRIFT.fraction;
      if (diff > AMOUNT_DRIFT.cents || diff > limit) {
        log.add({
          ruleId: 'DQ-AMOUNT',
          severity: 'warning',
          file: 'notices',
          rowRef: id,
          field: 'amount_owed',
          message: "Amount at notice differs from the lease's live balance. Both kept.",
          action: 'flagged',
          before: String(amountOwedAtNotice),
          after: String(liveBalance),
        });
      }
    }

    const guarantorName = safeText('notices', id, 'guarantor_name', row.guarantor_name);
    if (guarantorName !== null) guarantors.push({ caseId: id, name: guarantorName });

    cases.push({
      id,
      leaseId: lease?.id ?? null,
      tenantId: lease?.tenantId ?? namedTenantId,
      propertyId,
      stage,
      issueType: enumOf(
        'notices',
        id,
        'type_of_default',
        row.type_of_default,
        ISSUE_TYPE_TABLE,
        'other_lease_term',
      ),
      dateSent,
      curePeriod,
      owner: enumOf('notices', id, 'owner', row.owner, OWNER_TABLE, 'legal'),
      amountOwedAtNotice,
      legalFeesTerms: safeText('notices', id, 'legal_fees', row.legal_fees),
      lenderNotice: enumOf(
        'notices',
        id,
        'lender_notice',
        row.lender_notice,
        LENDER_NOTICE_TABLE,
        null,
      ),
      workflowStatus,
      courtCaseNo: orNull(row.case_no),
      guarantorName: null,
      hasGuarantor: guarantorName !== null || row.guarantor_ssn__present === '1',
    });

    // Updates become imported notes.
    const { notes, unparsed } = parseUpdates(row.updates);
    if (unparsed) {
      log.add({
        ruleId: 'DQ-NOTE',
        severity: 'warning',
        file: 'notices',
        rowRef: id,
        field: 'updates',
        message: 'Updates did not follow the dated-entry format. Kept as a single note.',
        action: 'flagged',
      });
    }
    notes.forEach((note, n) => {
      if (note.redactions > 0) {
        log.add({
          ruleId: 'DQ-PII',
          severity: 'warning',
          file: 'notices',
          rowRef: id,
          field: 'updates',
          message: `Redacted ${note.redactions} sensitive value${note.redactions === 1 ? '' : 's'} before saving.`,
          action: 'fixed',
        });
      }
      if (note.dateWasFixed) {
        log.add({
          ruleId: 'DQ-DATE',
          severity: 'info',
          file: 'notices',
          rowRef: id,
          field: 'updates',
          message: 'Update date converted to ISO format.',
          action: 'fixed',
          after: note.date ?? undefined,
        });
      }
      pendingEvents.push({
        id: `EV-${id}-${n + 1}`,
        caseId: id,
        date: note.date ?? dateSent,
        note: note.text,
      });
    });
  }

  // ---------- data date ----------

  const knownDates = [
    ...cases.flatMap((c) => (c.dateSent ? [c.dateSent] : [])),
    ...pendingEvents.flatMap((e) => (e.date ? [e.date] : [])),
  ].sort();
  if (knownDates.length === 0) throw new Error('No dates in the notices; cannot set the data date');
  const dataAsOf = knownDates[knownDates.length - 1];

  const events: CaseEvent[] = pendingEvents.map((event) => {
    const effectiveDate = event.date ?? dataAsOf;
    return {
      id: event.id,
      caseId: event.caseId,
      at: `${effectiveDate}T00:00:00.000Z`,
      effectiveDate,
      actorPersonaId: 'import',
      type: 'imported_note',
      payload: {},
      note: event.note,
    };
  });

  // ---------- COI ----------

  const coi: CoiRecord[] = [];
  const covered = new Set<string>();
  coiRows.forEach((row, index) => {
    const ref = `row ${index + 1}`;
    const tenantId = tenantRename('coi', ref, row.tenant_name);
    const rawProperty = text(row.property_id);
    const propertyId = properties.has(rawProperty) ? rawProperty : null;
    if (propertyId === null) {
      log.add({
        ruleId: 'DQ-ORPHAN',
        severity: 'warning',
        file: 'coi',
        rowRef: ref,
        field: 'property_id',
        message: 'COI row points at a property that does not exist.',
        action: 'flagged',
        before: rawProperty || 'empty',
      });
    }
    const leaseIds = leases
      .filter((l) => l.tenantId === tenantId && propertyId !== null && l.propertyId === propertyId)
      .map((l) => l.id);
    if (leaseIds.length === 0) {
      log.add({
        ruleId: 'DQ-ORPHAN',
        severity: 'warning',
        file: 'coi',
        rowRef: ref,
        field: 'tenant_name',
        message: 'No lease matches this tenant and property.',
        action: 'flagged',
      });
    }

    const status = enumOf('coi', ref, 'coi_status', row.coi_status, COI_STATUS_TABLE, 'unknown');
    const expiresOn = dateOf('coi', ref, 'expires_on', row.expires_on);
    const record: CoiRecord = { tenantId, propertyId, leaseIds, status, expiresOn };
    const effective = effectiveCoiStatus(record, dataAsOf);
    if (effective !== status) {
      log.add({
        ruleId: 'DQ-COI',
        severity: 'warning',
        file: 'coi',
        rowRef: ref,
        field: 'coi_status',
        message: `Status disagrees with the expiry date as of ${dataAsOf}. Kept the exported status.`,
        action: 'flagged',
        before: status,
        after: effective,
      });
    }
    coi.push(record);
    covered.add(`${tenantId}|${propertyId ?? ''}`);
  });

  // A lease the insurance tool has no row for counts as a missing certificate.
  const missing = new Map<string, CoiRecord>();
  for (const lease of leases) {
    const key = `${lease.tenantId}|${lease.propertyId ?? ''}`;
    if (covered.has(key)) continue;
    log.add({
      ruleId: 'DQ-COI-MISSING',
      severity: 'warning',
      file: 'coi',
      rowRef: lease.id,
      field: 'coi_status',
      message: 'The insurance tool has no certificate for this lease. Recorded as missing.',
      action: 'flagged',
    });
    const record = missing.get(key) ?? {
      tenantId: lease.tenantId,
      propertyId: lease.propertyId,
      leaseIds: [],
      status: 'missing' as CoiStatus,
      expiresOn: null,
    };
    record.leaseIds.push(lease.id);
    missing.set(key, record);
  }
  coi.push(...missing.values());

  // ---------- assemble ----------

  const seed = SeedSchema.parse({
    meta: { source: 'ingest', dataAsOf },
    properties: [...properties.values()]
      .map((p) => ({ ...p, aliases: [...p.aliases].sort() }))
      .sort(byId),
    people: [...people.values()].map((p) => ({ ...p, roles: [...p.roles].sort() })).sort(byId),
    tenants: [...registry.tenants].sort(byId),
    leases: leases.sort(byId),
    cases: cases.sort(byId),
    events: events.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    coi: coi.sort(
      (a, b) =>
        a.tenantId.localeCompare(b.tenantId) ||
        (a.propertyId ?? '').localeCompare(b.propertyId ?? ''),
    ),
    guarantors: guarantors.sort((a, b) =>
      a.caseId.localeCompare(b.caseId, undefined, { numeric: true }),
    ),
  });

  // Belt and braces: nothing SSN-shaped may leave this function, whatever the rules missed.
  if (/(?<![\w.])\d{3}-\d{2}-\d{4}(?!\w|\.\d)/.test(JSON.stringify(seed))) {
    throw new Error('SSN-shaped value found in ingest output; refusing to continue');
  }

  return { seed, issues: log.all() };
}

const AGING_MESSAGES = {
  understated:
    'Recorded aging is better than the balance allows. The lease may look healthier than it is.',
  stale: 'Aging says the lease is behind but the balance is zero.',
  cannot_validate: 'Rent or balance is missing, so the aging could not be checked.',
  credit: 'Tenant is in credit. Aging not checked.',
} as const;
