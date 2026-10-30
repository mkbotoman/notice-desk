import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  CaseEventSchema,
  CaseSchema,
  CurePeriodSchema,
  DataQualityIssueSchema,
  LeaseSchema,
  NotificationSchema,
  PersonaSchema,
  PersonSchema,
  PropertySchema,
  SeedSchema,
  TenantSchema,
  CoiRecordSchema,
} from './schemas';
import type {
  Case,
  CaseEvent,
  CoiRecord,
  CurePeriod,
  DataQualityIssue,
  Lease,
  Notification,
  Person,
  Persona,
  Property,
  Tenant,
} from './types';

// Compile-time parity: the schema and the interface must describe the same shape.
describe('schemas match types', () => {
  // Zod flattens the event union while types.ts shares a base, so check both directions instead.
  it('infers a mutually assignable CaseEvent', () => {
    expectTypeOf<z.infer<typeof CaseEventSchema>>().toExtend<CaseEvent>();
    expectTypeOf<CaseEvent>().toExtend<z.infer<typeof CaseEventSchema>>();
  });

  it('infers identical types', () => {
    expectTypeOf<z.infer<typeof PersonSchema>>().toEqualTypeOf<Person>();
    expectTypeOf<z.infer<typeof PropertySchema>>().toEqualTypeOf<Property>();
    expectTypeOf<z.infer<typeof TenantSchema>>().toEqualTypeOf<Tenant>();
    expectTypeOf<z.infer<typeof LeaseSchema>>().toEqualTypeOf<Lease>();
    expectTypeOf<z.infer<typeof CoiRecordSchema>>().toEqualTypeOf<CoiRecord>();
    expectTypeOf<z.infer<typeof CaseSchema>>().toEqualTypeOf<Case>();
    expectTypeOf<z.infer<typeof CurePeriodSchema>>().toEqualTypeOf<CurePeriod>();
    expectTypeOf<z.infer<typeof NotificationSchema>>().toEqualTypeOf<Notification>();
    expectTypeOf<z.infer<typeof DataQualityIssueSchema>>().toEqualTypeOf<DataQualityIssue>();
    expectTypeOf<z.infer<typeof PersonaSchema>>().toEqualTypeOf<Persona>();
  });
});

const baseCase: Case = {
  id: 'N-1',
  leaseId: 'L-1',
  tenantId: 'T-1',
  propertyId: 'P-1',
  stage: 'notice_to_cure',
  issueType: 'monetary',
  dateSent: '2026-09-28',
  curePeriod: { kind: 'days', n: 10, unit: 'business' },
  owner: 'legal',
  amountOwedAtNotice: 1000,
  legalFeesTerms: null,
  lenderNotice: null,
  workflowStatus: null,
  courtCaseNo: null,
  guarantorName: null,
  hasGuarantor: false,
};

describe('CaseSchema', () => {
  it('accepts a valid case', () => {
    expect(CaseSchema.safeParse(baseCase).success).toBe(true);
  });

  it('accepts an orphan case with no lease and no property', () => {
    expect(CaseSchema.safeParse({ ...baseCase, leaseId: null, propertyId: null }).success).toBe(
      true,
    );
  });

  it('accepts a lease whose own property is unknown, but not a property without a lease', () => {
    expect(CaseSchema.safeParse({ ...baseCase, propertyId: null }).success).toBe(true);
    expect(CaseSchema.safeParse({ ...baseCase, leaseId: null }).success).toBe(false);
  });

  it('rejects a guarantor name without hasGuarantor', () => {
    expect(CaseSchema.safeParse({ ...baseCase, guarantorName: 'A B' }).success).toBe(false);
    expect(
      CaseSchema.safeParse({ ...baseCase, guarantorName: 'A B', hasGuarantor: true }).success,
    ).toBe(true);
  });

  it('rejects an impossible date, fractional cents, and unknown keys', () => {
    expect(CaseSchema.safeParse({ ...baseCase, dateSent: '2026-02-30' }).success).toBe(false);
    expect(CaseSchema.safeParse({ ...baseCase, amountOwedAtNotice: 10.5 }).success).toBe(false);
    expect(CaseSchema.safeParse({ ...baseCase, guarantorSsn: 'x' }).success).toBe(false);
  });
});

describe('CurePeriodSchema', () => {
  it('accepts days, none and unknown', () => {
    expect(CurePeriodSchema.safeParse({ kind: 'days', n: 30, unit: 'calendar' }).success).toBe(
      true,
    );
    expect(CurePeriodSchema.safeParse({ kind: 'none' }).success).toBe(true);
    expect(CurePeriodSchema.safeParse({ kind: 'unknown' }).success).toBe(true);
  });

  it('rejects a zero or fractional day count', () => {
    expect(CurePeriodSchema.safeParse({ kind: 'days', n: 0, unit: 'calendar' }).success).toBe(
      false,
    );
    expect(CurePeriodSchema.safeParse({ kind: 'days', n: 2.5, unit: 'calendar' }).success).toBe(
      false,
    );
  });
});

describe('CaseEventSchema', () => {
  const base = {
    id: 'E-1',
    caseId: 'N-1',
    at: '2026-10-14T09:00:00.000Z',
    effectiveDate: '2026-10-14',
    actorPersonaId: 'maya',
  };

  it('requires the payload that matches the event type', () => {
    const ok = CaseEventSchema.safeParse({
      ...base,
      type: 'stage_changed',
      payload: { from: 'notice_to_cure', to: 'default' },
    });
    expect(ok.success).toBe(true);
    expect(CaseEventSchema.safeParse({ ...base, type: 'stage_changed', payload: {} }).success).toBe(
      false,
    );
    expect(
      CaseEventSchema.safeParse({ ...base, type: 'note', payload: { to: 'default' } }).success,
    ).toBe(false);
  });
});

describe('SeedSchema', () => {
  it('rejects a seed missing a collection', () => {
    expect(
      SeedSchema.safeParse({ meta: { source: 'fixture', dataAsOf: '2026-10-14' } }).success,
    ).toBe(false);
  });
});
