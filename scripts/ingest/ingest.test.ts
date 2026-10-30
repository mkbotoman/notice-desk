import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DataQualityIssue } from '@/domain/types';
import { ingest, REQUIRED_COLUMNS, type IngestResult, type RawCsv } from './ingest';

type R = Record<string, string>;
const ssn = ['123', '45', '6789'].join('-');

const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
const toCsv = (cols: readonly string[], rows: R[]) =>
  [cols.join(','), ...rows.map((r) => cols.map((c) => quote(r[c] ?? '')).join(','))].join('\n') +
  '\n';

const prop = (o: R = {}): R => ({
  property_id: 'P-1',
  name: 'Harbor Commons',
  type: 'Retail',
  city: 'Long Beach',
  state: 'CA',
  market: 'South Bay',
  fund: 'Income REIT',
  asset_manager: 'Lena Brooks',
  property_manager: 'Rosa Park',
  sq_ft: '84000',
  acquired_date: '2019-04-12',
  ...o,
});
const lease = (o: R = {}): R => ({
  lease_id: 'L-1',
  property_id: 'P-1',
  tenant_name: 'Brightside Fitness LLC',
  suite: '110',
  sq_ft: '6200',
  lease_status: 'Current',
  start_date: '2022-01-01',
  end_date: '2027-12-31',
  monthly_rent: '8500.00',
  ar_balance: '0.00',
  ar_aging: 'Current',
  watchlist_reasons: '',
  ...o,
});
const notice = (o: R = {}): R => ({
  notice_id: 'N-1',
  lease_id: 'L-1',
  tenant_name: 'Brightside Fitness LLC',
  property_name: 'Harbor Commons',
  stage: 'Notice to Cure',
  status: 'Sent',
  type_of_default: 'Monetary',
  date_sent: '2026-09-28',
  cure_period: '10 business days',
  lender_notice: 'No',
  legal_fees: 'Yes',
  owner: 'Legal',
  amount_owed: '',
  case_no: '',
  guarantor_name: 'Jane Doe',
  guarantor_ssn: ssn,
  updates: '9/28/26 - Notice sent',
  ...o,
});
const coiRow = (o: R = {}): R => ({
  tenant_name: 'Brightside Fitness LLC',
  property_id: 'P-1',
  coi_status: 'Current',
  expires_on: '2027-03-31',
  ...o,
});

interface Data {
  properties?: R[];
  leases?: R[];
  notices?: R[];
  coi?: R[];
}
const build = (d: Data = {}): RawCsv => ({
  properties: toCsv(REQUIRED_COLUMNS.properties, d.properties ?? [prop()]),
  leases: toCsv(REQUIRED_COLUMNS.leases, d.leases ?? [lease()]),
  notices: toCsv([...REQUIRED_COLUMNS.notices, 'guarantor_ssn'], d.notices ?? [notice()]),
  coi: toCsv(REQUIRED_COLUMNS.coi, d.coi ?? [coiRow()]),
});
const run = (d: Data = {}): IngestResult => ingest(build(d));
const rule = (r: IngestResult, id: string): DataQualityIssue[] =>
  r.issues.filter((i) => i.ruleId === id);

describe('a clean dataset', () => {
  const result = run();

  it('builds a valid seed with the data date taken from the notices', () => {
    expect(result.seed.meta).toEqual({ source: 'ingest', dataAsOf: '2026-09-28' });
    expect(result.seed.properties).toHaveLength(1);
    expect(result.seed.leases[0]).toMatchObject({
      id: 'L-1',
      propertyId: 'P-1',
      status: 'active',
      monthlyRent: 850000,
      arBalance: 0,
      arAgingRecorded: 'current',
      arAgingImplied: 'current',
      suite: '110',
      sqFt: 6200,
    });
    expect(result.seed.cases[0]).toMatchObject({
      id: 'N-1',
      stage: 'notice_to_cure',
      issueType: 'monetary',
      owner: 'legal',
      lenderNotice: 'none',
      legalFeesTerms: 'Yes',
      workflowStatus: 'Sent',
      curePeriod: { kind: 'days', n: 10, unit: 'business' },
    });
  });

  it('turns updates into imported notes', () => {
    expect(result.seed.events).toEqual([
      {
        id: 'EV-N-1-1',
        caseId: 'N-1',
        at: '2026-09-28T00:00:00.000Z',
        effectiveDate: '2026-09-28',
        actorPersonaId: 'import',
        type: 'imported_note',
        payload: {},
        note: 'Notice sent',
      },
    ]);
  });

  it('keeps guarantor names out of the cases and the SSN out of everything', () => {
    expect(result.seed.cases[0]).toMatchObject({ guarantorName: null, hasGuarantor: true });
    expect(result.seed.guarantors).toEqual([{ caseId: 'N-1', name: 'Jane Doe' }]);
    expect(JSON.stringify(result)).not.toContain(ssn);
    expect(JSON.stringify(result)).not.toContain(ssn.replace(/-/g, ''));
  });

  it('reports only the date fix for the slash-formatted update', () => {
    expect(result.issues.map((i) => [i.ruleId, i.action])).toEqual([['DQ-DATE', 'fixed']]);
  });

  it('is deterministic, whatever order the rows arrive in', () => {
    const rows = {
      properties: [prop({ property_id: 'P-2', name: 'Other', asset_manager: 'Tom Reyes' }), prop()],
      leases: [lease({ lease_id: 'L-2', tenant_name: 'Zed Co' }), lease()],
      notices: [notice({ notice_id: 'N-2', lease_id: 'L-2', tenant_name: 'Zed Co' }), notice()],
      coi: [coiRow({ tenant_name: 'Zed Co' }), coiRow()],
    };
    const reversed = Object.fromEntries(
      Object.entries(rows).map(([k, v]) => [k, [...v].reverse()]),
    ) as Data;
    expect(run(rows)).toEqual(run(reversed));
  });
});

describe('input checks', () => {
  it('fails fast when a file lacks a column', () => {
    const raw = build();
    raw.leases = raw.leases.replace('ar_aging', 'aging');
    expect(() => ingest(raw)).toThrow(/leases CSV is missing column\(s\): ar_aging/);
  });

  it('refuses a dataset with no dates at all', () => {
    expect(() => run({ notices: [notice({ date_sent: '', updates: '' })] })).toThrow(/data date/);
  });
});

describe('DQ-DUP', () => {
  it('keeps the most complete duplicate and drops the rest', () => {
    const r = run({
      leases: [lease({ suite: '' }), lease({ suite: '110' }), lease({ suite: '' })],
    });
    expect(r.seed.leases).toHaveLength(1);
    expect(r.seed.leases[0].suite).toBe('110');
    expect(rule(r, 'DQ-DUP').map((i) => i.action)).toEqual(['dropped', 'dropped']);
  });

  it('drops a row with no key, and treats a repeated COI tenant + property as a duplicate', () => {
    const r = run({
      leases: [lease(), lease({ lease_id: '' })],
      coi: [coiRow(), coiRow({ tenant_name: 'BRIGHTSIDE FITNESS' })],
    });
    expect(r.seed.leases).toHaveLength(1);
    expect(r.seed.coi).toHaveLength(1);
    expect(rule(r, 'DQ-DUP').map((i) => [i.file, i.severity])).toEqual([
      ['coi', 'warning'],
      ['leases', 'error'],
    ]);
  });
});

describe('DQ-DATE', () => {
  it('converts non-ISO dates and flags unreadable ones', () => {
    const r = run({
      leases: [
        lease({ start_date: '1/5/2022', end_date: 'Sept 30 2027' }),
        lease({ lease_id: 'L-2', start_date: 'someday', suite: '2' }),
      ],
    });
    const fixes = rule(r, 'DQ-DATE').filter((i) => i.file === 'leases');
    expect(fixes.map((i) => [i.rowRef, i.field, i.action, i.after ?? i.before])).toEqual([
      ['L-1', 'end_date', 'fixed', '2027-09-30'],
      ['L-1', 'start_date', 'fixed', '2022-01-05'],
      ['L-2', 'start_date', 'flagged', 'someday'],
    ]);
    expect(r.seed.leases.find((l) => l.id === 'L-2')?.startDate).toBeNull();
  });

  it('flags a lease that ends before it starts', () => {
    const r = run({ leases: [lease({ start_date: '2027-01-01', end_date: '2026-01-01' })] });
    expect(rule(r, 'DQ-DATE').find((i) => i.field === 'end_date')?.message).toMatch(/ends before/);
  });
});

describe('DQ-MONEY', () => {
  it('converts money formats and flags text and negatives where they do not belong', () => {
    const r = run({
      leases: [
        lease({ monthly_rent: '$8,500.00', ar_balance: '(250.00)' }),
        lease({ lease_id: 'L-2', suite: '2', monthly_rent: 'TBD', ar_balance: '' }),
        lease({ lease_id: 'L-3', suite: '3', monthly_rent: '-5' }),
      ],
      properties: [prop({ sq_ft: '84,000' })],
    });
    const [one, two, three] = r.seed.leases;
    expect([one.monthlyRent, one.arBalance]).toEqual([850000, -25000]);
    expect([two.monthlyRent, two.arBalance]).toEqual([null, null]);
    expect(three.monthlyRent).toBeNull();
    expect(r.seed.properties[0].sqFt).toBe(84000);
    expect(rule(r, 'DQ-MONEY').map((i) => [i.rowRef, i.field, i.action])).toEqual([
      ['L-1', 'ar_balance', 'fixed'],
      ['L-1', 'monthly_rent', 'fixed'],
      ['L-2', 'monthly_rent', 'flagged'],
      ['L-3', 'monthly_rent', 'flagged'],
    ]);
  });
});

describe('DQ-ENUM', () => {
  it('maps aliases, falls back on unknowns, and drops a notice with no usable stage', () => {
    const r = run({
      properties: [
        prop({ type: 'Mixed Use' }),
        prop({ property_id: 'P-2', name: 'B', type: 'Spaceport' }),
      ],
      leases: [lease({ lease_status: 'Active', ar_aging: '91+' })],
      notices: [
        notice({
          stage: 'NTC',
          type_of_default: 'Rent',
          owner: 'Asset Mgmt',
          lender_notice: 'Maybe',
        }),
        notice({ notice_id: 'N-2', stage: 'Sorta Default', guarantor_ssn: '' }),
        notice({ notice_id: 'N-3', stage: '', guarantor_ssn: '' }),
        notice({
          notice_id: 'N-4',
          owner: 'The Moon',
          type_of_default: 'Weirdness',
          guarantor_ssn: '',
        }),
      ],
    });
    expect(r.seed.properties.map((p) => p.type)).toEqual(['other', 'other']);
    expect(r.seed.leases[0]).toMatchObject({ status: 'active', arAgingRecorded: '90_plus' });
    const byId = new Map(r.seed.cases.map((c) => [c.id, c]));
    expect(byId.get('N-1')).toMatchObject({
      stage: 'notice_to_cure',
      issueType: 'monetary',
      owner: 'asset_management',
      lenderNotice: null,
    });
    expect(byId.get('N-4')).toMatchObject({ owner: 'legal', issueType: 'other_lease_term' });
    expect(byId.has('N-2') || byId.has('N-3')).toBe(false);
    expect(
      rule(r, 'DQ-ENUM')
        .filter((i) => i.action === 'dropped')
        .map((i) => i.rowRef),
    ).toEqual(['N-2', 'N-3']);
  });
});

describe('DQ-TENANT', () => {
  it('merges spelling variants across files and reports each rename', () => {
    const r = run({
      leases: [lease(), lease({ lease_id: 'L-2', suite: '2', tenant_name: 'BrightSide Fitness' })],
      notices: [notice({ tenant_name: 'Brightside Fitness, L.L.C.' })],
      coi: [coiRow({ tenant_name: 'brightside fitness llc' })],
    });
    expect(r.seed.tenants).toHaveLength(1);
    expect(r.seed.tenants[0].displayName).toBe('Brightside Fitness, L.L.C.');
    expect(r.seed.tenants[0].nameVariants).toEqual([
      'BrightSide Fitness',
      'Brightside Fitness LLC',
      'brightside fitness llc',
    ]);
    expect(rule(r, 'DQ-TENANT').map((i) => [i.file, i.rowRef])).toEqual([
      ['coi', 'row 1'],
      ['leases', 'L-1'],
      ['leases', 'L-2'],
    ]);
  });

  it('flags near matches for review without merging them', () => {
    const r = run({
      leases: [lease(), lease({ lease_id: 'L-2', suite: '2', tenant_name: 'Brightsyde Fitness' })],
    });
    expect(r.seed.tenants).toHaveLength(2);
    expect(rule(r, 'DQ-TENANT').map((i) => i.action)).toEqual(['flagged']);
  });

  it('drops rows with no tenant name', () => {
    const r = run({ leases: [lease(), lease({ lease_id: 'L-2', tenant_name: ' ' })] });
    expect(r.seed.leases).toHaveLength(1);
    expect(rule(r, 'DQ-TENANT')[0]).toMatchObject({ action: 'dropped', rowRef: 'L-2' });
  });

  it("trusts the lease's tenant when a notice names someone else", () => {
    const r = run({ notices: [notice({ tenant_name: 'Totally Different Tenant' })] });
    expect(r.seed.cases[0].tenantId).toBe(r.seed.leases[0].tenantId);
    expect(rule(r, 'DQ-TENANT').filter((i) => i.action === 'flagged')).toHaveLength(1);
  });
});

describe('DQ-PROP', () => {
  it('records a believable abbreviation as an alias at info level', () => {
    const r = run({ notices: [notice({ property_name: 'Harbor Cmns' })] });
    expect(r.seed.properties[0].aliases).toEqual(['Harbor Cmns']);
    expect(rule(r, 'DQ-PROP')[0]).toMatchObject({ severity: 'info', action: 'flagged' });
  });

  it('warns when the notice names an unrelated property, and records each alias once', () => {
    const r = run({
      leases: [lease(), lease({ lease_id: 'L-2', suite: '2' })],
      notices: [
        notice({ property_name: 'Riverside Mall' }),
        notice({
          notice_id: 'N-2',
          lease_id: 'L-2',
          property_name: 'Riverside Mall',
          guarantor_ssn: '',
        }),
      ],
    });
    expect(r.seed.properties[0].aliases).toEqual(['Riverside Mall']);
    expect(rule(r, 'DQ-PROP').map((i) => i.severity)).toEqual(['warning', 'warning']);
  });
});

describe('DQ-ORPHAN', () => {
  it('keeps a lease whose property does not exist, without a property', () => {
    const r = run({ leases: [lease({ property_id: 'P-99' })] });
    expect(r.seed.leases[0].propertyId).toBeNull();
    expect(rule(r, 'DQ-ORPHAN').find((i) => i.file === 'leases')).toMatchObject({ before: 'P-99' });
  });

  it('keeps a notice whose lease does not exist, matched to its tenant by name', () => {
    const r = run({
      notices: [
        notice({ lease_id: 'L-404', tenant_name: 'Stranger Co', property_name: 'Anything' }),
      ],
    });
    expect(r.seed.cases[0]).toMatchObject({ leaseId: null, propertyId: null });
    expect(r.seed.tenants.map((t) => t.displayName)).toContain('Stranger Co');
    expect(rule(r, 'DQ-ORPHAN').find((i) => i.file === 'notices')).toMatchObject({
      before: 'L-404',
    });
  });

  it('keeps COI rows for an unknown property or with no matching lease', () => {
    const r = run({
      coi: [coiRow({ property_id: 'P-99' }), coiRow({ tenant_name: 'Nobody Inc' })],
    });
    expect(rule(r, 'DQ-ORPHAN').filter((i) => i.file === 'coi')).toHaveLength(3);
    expect(r.seed.coi.filter((c) => c.status !== 'missing')).toHaveLength(2);
  });
});

describe('DQ-STAGE', () => {
  it('keeps the stage and flags a status that names a different end state', () => {
    const r = run({ notices: [notice({ stage: 'Default', status: 'Cured' })] });
    expect(r.seed.cases[0].stage).toBe('default');
    expect(rule(r, 'DQ-STAGE')[0]).toMatchObject({
      action: 'flagged',
      before: 'Cured',
      after: 'default',
    });
  });

  it('accepts a status that fits, or one that says nothing about the end state', () => {
    const r = run({ notices: [notice({ stage: 'Closed', status: 'Collections Settled' })] });
    expect(rule(r, 'DQ-STAGE')).toEqual([]);
    expect(rule(run({ notices: [notice({ status: '' })] }), 'DQ-STAGE')).toEqual([]);
  });
});

describe('DQ-CURE', () => {
  const cureIssues = (notices: R[]) => rule(run({ notices }), 'DQ-CURE');
  const curePeriodOf = (n: R) => run({ notices: [n] }).seed.cases[0].curePeriod;

  it('treats a blank cure on an unsent notice as no cure, silently', () => {
    const n = notice({
      stage: 'Non-Compliant',
      date_sent: '',
      cure_period: '',
      updates: '9/1/26 - Flagged',
    });
    expect(curePeriodOf(n)).toEqual({ kind: 'none' });
    expect(cureIssues([n])).toEqual([]);
  });

  it('makes a sent notice with no cure period a missing deadline, and says so', () => {
    const n = notice({ cure_period: '' });
    expect(curePeriodOf(n)).toEqual({ kind: 'unknown' });
    expect(cureIssues([n])[0]).toMatchObject({ severity: 'warning', action: 'flagged' });
  });

  it('flags an unreadable cure period and keeps it unknown', () => {
    const n = notice({ cure_period: 'soon-ish' });
    expect(curePeriodOf(n)).toEqual({ kind: 'unknown' });
    expect(cureIssues([n])[0]).toMatchObject({ before: 'soon-ish', action: 'flagged' });
  });

  it('assumes calendar days when no day type is given, and reports the assumption', () => {
    const n = notice({ cure_period: '10 days' });
    expect(curePeriodOf(n)).toEqual({ kind: 'days', n: 10, unit: 'calendar' });
    expect(cureIssues([n])[0]).toMatchObject({
      severity: 'info',
      action: 'fixed',
      after: '10 calendar days',
    });
  });

  it('does not comment on an explicit day type or an explicit no-cure notice', () => {
    expect(cureIssues([notice({ cure_period: '10 calendar days' })])).toEqual([]);
    expect(cureIssues([notice({ cure_period: '10 business days' })])).toEqual([]);
    expect(cureIssues([notice({ cure_period: 'No cure date' })])).toEqual([]);
    expect(curePeriodOf(notice({ cure_period: 'No cure date' }))).toEqual({ kind: 'none' });
  });

  it('flags a cure period with no send date, except before the notice goes out', () => {
    const sent = notice({ date_sent: '', cure_period: '10 business days' });
    expect(cureIssues([sent]).map((i) => i.field)).toEqual(['date_sent']);
    const early = notice({
      stage: 'Non-Compliant',
      date_sent: '',
      cure_period: '10 business days',
      updates: '9/1/26 - x',
    });
    expect(cureIssues([early])).toEqual([]);
  });
});

describe('DQ-AMOUNT', () => {
  const withBalance = (balance: string, owed: string) =>
    run({
      leases: [lease({ ar_balance: balance, ar_aging: '31_60' })],
      notices: [notice({ amount_owed: owed })],
    });

  it('accepts an amount equal to the live balance', () => {
    expect(rule(withBalance('8500.00', '8500.00'), 'DQ-AMOUNT')).toEqual([]);
  });

  it('flags drift of more than 5% or more than $500, keeping both figures', () => {
    const r = withBalance('10000.00', '9000.00');
    expect(rule(r, 'DQ-AMOUNT')[0]).toMatchObject({
      before: '900000',
      after: '1000000',
      action: 'flagged',
    });
    expect(r.seed.cases[0].amountOwedAtNotice).toBe(900000);
    expect(rule(withBalance('100000.00', '99000.00'), 'DQ-AMOUNT')).toHaveLength(1);
    expect(rule(withBalance('0.00', '10.00'), 'DQ-AMOUNT')).toHaveLength(1);
  });

  it('ignores small drift and notices without an amount, and flags text like "Pending"', () => {
    expect(rule(withBalance('10000.00', '9900.00'), 'DQ-AMOUNT')).toEqual([]);
    expect(rule(withBalance('10000.00', ''), 'DQ-AMOUNT')).toEqual([]);
    const pending = withBalance('10000.00', 'Pending');
    expect(pending.seed.cases[0].amountOwedAtNotice).toBeNull();
    expect(rule(pending, 'DQ-MONEY')[0]).toMatchObject({ field: 'amount_owed', action: 'flagged' });
  });
});

describe('DQ-COI', () => {
  it('flags an exported status that disagrees with the expiry date, keeping the export', () => {
    const r = run({ coi: [coiRow({ coi_status: 'Current', expires_on: '2026-09-01' })] });
    expect(r.seed.coi[0].status).toBe('valid');
    expect(rule(r, 'DQ-COI')[0]).toMatchObject({ before: 'valid', after: 'expired' });
  });

  it('leaves Non-Compliant and agreeing statuses alone', () => {
    const r = run({ coi: [coiRow({ coi_status: 'Non-Compliant', expires_on: '2030-01-01' })] });
    expect(r.seed.coi[0].status).toBe('non_compliant');
    expect(rule(r, 'DQ-COI')).toEqual([]);
  });

  it('records a missing certificate for every lease the insurance tool has no row for', () => {
    const r = run({
      leases: [
        lease(),
        lease({ lease_id: 'L-2', suite: '2', tenant_name: 'Coastal Coffee Co' }),
        lease({ lease_id: 'L-3', suite: '3', tenant_name: 'Coastal Coffee Co' }),
        lease({ lease_id: 'L-4', suite: '4', tenant_name: 'Lost Co', property_id: 'P-99' }),
      ],
    });
    const missing = r.seed.coi.filter((c) => c.status === 'missing');
    expect(missing.map((c) => [c.propertyId, c.leaseIds])).toEqual([
      ['P-1', ['L-2', 'L-3']],
      [null, ['L-4']],
    ]);
    expect(rule(r, 'DQ-COI-MISSING').map((i) => i.rowRef)).toEqual(['L-2', 'L-3', 'L-4']);
  });
});

describe('DQ-AR', () => {
  it('flags aging that understates the balance, and stores the implied floor', () => {
    const r = run({ leases: [lease({ ar_balance: '17000.00', ar_aging: 'Current' })] });
    expect(r.seed.leases[0].arAgingImplied).toBe('31_60');
    expect(rule(r, 'DQ-AR')[0]).toMatchObject({
      severity: 'error',
      before: 'current',
      after: '31_60',
    });
  });

  it('is silent when the data is consistent, as the real export is', () => {
    const r = run({ leases: [lease({ ar_balance: '8500.00', ar_aging: '31-60' })] });
    expect(rule(r, 'DQ-AR')).toEqual([]);
    expect(r.seed.leases[0].arAgingImplied).toBe('current');
  });

  it('reports stale aging, credits, and rent that cannot be validated', () => {
    const r = run({
      leases: [
        lease({ ar_balance: '0.00', ar_aging: '61-90' }),
        lease({ lease_id: 'L-2', suite: '2', ar_balance: '-100.00' }),
        lease({ lease_id: 'L-3', suite: '3', monthly_rent: '0.00', ar_balance: '50.00' }),
      ],
    });
    expect(rule(r, 'DQ-AR').map((i) => [i.rowRef, i.severity])).toEqual([
      ['L-1', 'warning'],
      ['L-2', 'info'],
      ['L-3', 'warning'],
    ]);
  });
});

describe('DQ-SUITE', () => {
  it('flags a second lease on the same property and suite, keeping both', () => {
    const r = run({
      leases: [lease(), lease({ lease_id: 'L-2', tenant_name: 'Other Co', suite: '110' })],
    });
    expect(r.seed.leases).toHaveLength(2);
    expect(rule(r, 'DQ-SUITE')[0]).toMatchObject({ rowRef: 'L-2', action: 'flagged' });
  });
});

describe('DQ-NOTE and DQ-PII', () => {
  it('keeps unstructured updates as one note dated on the send date, and says so', () => {
    const r = run({ notices: [notice({ updates: 'Called tenant, left voicemail' })] });
    expect(r.seed.events[0]).toMatchObject({
      effectiveDate: '2026-09-28',
      note: 'Called tenant, left voicemail',
    });
    expect(rule(r, 'DQ-NOTE')).toHaveLength(1);
  });

  it('dates an undated note on the data date when the notice was never sent', () => {
    const r = run({
      notices: [
        notice({ updates: '9/30/26 - Flagged' }),
        notice({
          notice_id: 'N-2',
          stage: 'Non-Compliant',
          date_sent: '',
          cure_period: '',
          updates: 'free text',
          guarantor_ssn: '',
        }),
      ],
      leases: [lease()],
    });
    const free = r.seed.events.find((e) => e.caseId === 'N-2');
    expect(free?.effectiveDate).toBe('2026-09-30');
    expect(r.seed.meta.dataAsOf).toBe('2026-09-30');
  });

  it('redacts SSNs from free text, and logs the count but never the value', () => {
    const r = run({
      notices: [
        notice({
          updates: `9/28/26 - Guarantor ${ssn} confirmed`,
          status: `Hold ${ssn}`,
          legal_fees: `Yes ${ssn}`,
        }),
      ],
    });
    expect(r.seed.events[0].note).toBe('Guarantor [redacted] confirmed');
    expect(r.seed.cases[0].workflowStatus).toBe('Hold [redacted]');
    expect(
      rule(r, 'DQ-PII')
        .map((i) => i.field)
        .sort(),
    ).toEqual(['legal_fees', 'status', 'updates']);
    expect(JSON.stringify(r)).not.toContain(ssn);
  });

  it('counts a guarantor with an SSN but no name', () => {
    const r = run({ notices: [notice({ guarantor_name: '' })] });
    expect(r.seed.cases[0].hasGuarantor).toBe(true);
    expect(r.seed.guarantors).toEqual([]);
    expect(
      run({ notices: [notice({ guarantor_name: '', guarantor_ssn: '' })] }).seed.cases[0]
        .hasGuarantor,
    ).toBe(false);
  });

  it('refuses to produce output if an SSN-shaped value slips through a field nothing redacts', () => {
    expect(() => run({ leases: [lease({ suite: ssn })] })).toThrow(/SSN-shaped/);
  });
});

describe('people and properties', () => {
  it('derives people from the manager columns, merging a person who holds both roles', () => {
    const r = run({
      properties: [
        prop({ asset_manager: 'Sam Lee', property_manager: 'Sam  Lee' }),
        prop({ property_id: 'P-2', name: 'B', asset_manager: '', property_manager: 'Rosa Park' }),
      ],
    });
    expect(r.seed.people).toEqual([
      { id: 'PER-rosa-park', name: 'Rosa Park', roles: ['property_manager'] },
      { id: 'PER-sam-lee', name: 'Sam Lee', roles: ['asset_manager', 'property_manager'] },
    ]);
    expect(r.seed.properties[1].assetManagerId).toBeNull();
  });
});

const raw = (name: string) => path.join(process.cwd(), 'data', 'raw', name);
const haveRaw = ['properties', 'leases', 'notices', 'coi_status'].every((n) =>
  existsSync(raw(`${n}.csv`)),
);

describe.skipIf(!haveRaw)('the real CSVs (local only: data/raw is gitignored)', () => {
  let result: IngestResult;
  beforeAll(() => {
    result = ingest({
      properties: readFileSync(raw('properties.csv'), 'utf8'),
      leases: readFileSync(raw('leases.csv'), 'utf8'),
      notices: readFileSync(raw('notices.csv'), 'utf8'),
      coi: readFileSync(raw('coi_status.csv'), 'utf8'),
    });
  });

  it('ingest with zero schema errors and the counts the profile found', () => {
    const { seed } = result;
    expect([
      seed.properties.length,
      seed.leases.length,
      seed.cases.length,
      seed.tenants.length,
    ]).toEqual([21, 174, 37, 74]);
    expect(seed.meta.dataAsOf).toBe('2026-10-13');
    expect(seed.cases.every((c) => c.hasGuarantor)).toBe(true);
    expect(seed.leases.filter((l) => l.propertyId === null)).toHaveLength(2);
  });

  it('gives every issue a rule id, and finds no DQ-AR problem in this export', () => {
    expect(result.issues.every((i) => i.ruleId.startsWith('DQ-'))).toBe(true);
    expect(rule(result, 'DQ-AR')).toEqual([]);
    expect(rule(result, 'DQ-COI-MISSING')).toHaveLength(19);
  });

  it('carries no SSN-shaped value anywhere', () => {
    expect(JSON.stringify(result)).not.toMatch(/(?<![\w.])\d{3}-\d{2}-\d{4}(?!\w|\.\d)/);
  });
});
