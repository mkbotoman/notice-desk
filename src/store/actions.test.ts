import { describe, expect, it } from 'vitest';
import { makeCase } from '@/test/factories';
import type { Persona } from '@/domain/types';
import { CaseEventSchema } from '@/domain/schemas';
import type { Lease } from '@/domain/types';
import {
  buildAdvance,
  buildNotificationEvent,
  buildOpenCase,
  buildOwnerChange,
  buildUpdate,
  PermissionError,
} from './actions';

const persona = (over: Partial<Persona>): Persona => ({
  id: 'p',
  label: 'P',
  kind: 'legal',
  personId: null,
  team: 'legal',
  scopePropertyIds: 'all',
  ...over,
});
const maya = persona({ id: 'maya' });
const lena = persona({
  id: 'am-lena',
  kind: 'asset_manager',
  team: 'asset_management',
  scopePropertyIds: ['P-1'],
});
const founder = persona({ id: 'founder', kind: 'founder', team: null });
const ctx = (p: Persona) => ({
  persona: p,
  asOf: '2026-10-13',
  now: () => new Date('2026-10-30T12:00:00.000Z'),
  newId: () => 'abc123',
});

describe('buildUpdate', () => {
  it('builds a valid, audited note dated on the as-of date by default', () => {
    const event = buildUpdate(makeCase(), '  Called tenant  ', ctx(maya));
    expect(CaseEventSchema.parse(event)).toEqual(event);
    expect(event).toMatchObject({
      type: 'note',
      caseId: 'N-1',
      actorPersonaId: 'maya',
      note: 'Called tenant',
      effectiveDate: '2026-10-13',
      at: '2026-10-30T12:00:00.000Z',
    });
    expect(event.id).toMatch(/^EV-N-1-.+-abc123$/);
  });

  it('honours an explicit date, and lets an asset manager add updates in scope only', () => {
    expect(buildUpdate(makeCase(), 'x', ctx(lena), '2026-10-01').effectiveDate).toBe('2026-10-01');
    expect(() => buildUpdate(makeCase({ propertyId: 'P-9' }), 'x', ctx(lena))).toThrow(
      PermissionError,
    );
  });

  it('rejects empty text and read-only personas', () => {
    expect(() => buildUpdate(makeCase(), '   ', ctx(maya))).toThrow(/some text/);
    expect(() => buildUpdate(makeCase(), 'x', ctx(founder))).toThrow(PermissionError);
  });
});

describe('buildAdvance', () => {
  it('records the from and to stages, with an optional note', () => {
    const event = buildAdvance(makeCase(), 'default', ctx(maya), 'No payment received');
    expect(CaseEventSchema.parse(event)).toEqual(event);
    expect(event).toMatchObject({
      type: 'stage_changed',
      payload: { from: 'notice_to_cure', to: 'default' },
      note: 'No payment received',
    });
  });

  it('omits the note when blank', () => {
    expect('note' in buildAdvance(makeCase(), 'default', ctx(maya), '  ')).toBe(false);
  });

  it('refuses illegal transitions and anyone but Legal', () => {
    expect(() => buildAdvance(makeCase(), 'closed', ctx(maya))).toThrow(/Can't move/);
    expect(() => buildAdvance(makeCase({ stage: 'closed' }), 'default', ctx(maya))).toThrow(
      /Can't move/,
    );
    expect(() => buildAdvance(makeCase(), 'default', ctx(lena))).toThrow(PermissionError);
    expect(() => buildAdvance(makeCase(), 'default', ctx(founder))).toThrow(PermissionError);
  });
});

describe('buildOwnerChange', () => {
  it('lets Legal hand a case to either team', () => {
    const event = buildOwnerChange(makeCase(), 'asset_management', ctx(maya));
    expect(CaseEventSchema.parse(event)).toEqual(event);
    expect(event.payload).toEqual({ from: 'legal', to: 'asset_management' });
    expect(
      buildOwnerChange(makeCase({ owner: 'asset_management' }), 'legal', ctx(maya)).payload,
    ).toEqual({
      from: 'asset_management',
      to: 'legal',
    });
  });

  it('lets an asset manager hand back to Legal only, and only a case that is with them', () => {
    const mine = makeCase({ owner: 'asset_management' });
    expect(buildOwnerChange(mine, 'legal', ctx(lena)).payload).toEqual({
      from: 'asset_management',
      to: 'legal',
    });
    expect(() => buildOwnerChange(mine, 'asset_management', ctx(lena))).toThrow(
      /only hand a case back/,
    );
    expect(() => buildOwnerChange(makeCase({ owner: 'legal' }), 'legal', ctx(lena))).toThrow(
      PermissionError,
    );
  });

  it('refuses a read-only persona', () => {
    expect(() => buildOwnerChange(makeCase(), 'asset_management', ctx(founder))).toThrow(
      PermissionError,
    );
  });
});

describe('default context', () => {
  it('works with the real clock and random ids', () => {
    const event = buildUpdate(makeCase(), 'x', { persona: maya, asOf: '2026-10-13' });
    expect(Date.parse(event.at)).not.toBeNaN();
    expect(event.id.startsWith('EV-N-1-')).toBe(true);
  });
});

describe('buildNotificationEvent', () => {
  it('logs a manual draft or send under the acting persona', () => {
    const drafted = buildNotificationEvent(makeCase(), 'notification_drafted', 'NT-1', ctx(maya));
    expect(CaseEventSchema.parse(drafted)).toEqual(drafted);
    expect(drafted).toMatchObject({
      type: 'notification_drafted',
      actorPersonaId: 'maya',
      payload: { notificationId: 'NT-1' },
    });
    expect(buildNotificationEvent(makeCase(), 'notification_sent', 'NT-1', ctx(maya)).type).toBe(
      'notification_sent',
    );
  });

  it('logs an automatic draft as the system, with no permission check', () => {
    const event = buildNotificationEvent(makeCase(), 'notification_drafted', 'NT-2', ctx(founder), {
      automatic: true,
    });
    expect(event.actorPersonaId).toBe('system');
  });

  it('refuses a persona that may not send notifications', () => {
    expect(() =>
      buildNotificationEvent(makeCase(), 'notification_sent', 'NT-1', ctx(lena)),
    ).toThrow(PermissionError);
  });
});

describe('buildOpenCase', () => {
  const lease: Lease = {
    id: 'L-9',
    propertyId: 'P-1',
    tenantId: 'T-9',
    suite: '1',
    sqFt: null,
    status: 'active',
    startDate: null,
    endDate: null,
    monthlyRent: 100000,
    arBalance: 250000,
    arAgingRecorded: '61_90',
    arAgingImplied: '31_60',
    watchlistReasons: [],
  };
  const rent = { kind: 'rent', label: 'Rent 61–90 days' } as const;
  const insurance = { kind: 'insurance', label: 'No insurance on file' } as const;
  const listed = { kind: 'listed', label: 'Going Dark' } as const;

  it('builds a valid Legal-owned Non-Compliant case with no deadline, and an event saying why', () => {
    const { newCase, event } = buildOpenCase(lease, [rent, insurance], ctx(maya));
    expect(newCase).toMatchObject({
      leaseId: 'L-9',
      tenantId: 'T-9',
      propertyId: 'P-1',
      stage: 'non_compliant',
      owner: 'legal',
      dateSent: null,
      curePeriod: { kind: 'none' },
      issueType: 'monetary',
      amountOwedAtNotice: 250000,
    });
    expect(newCase.id).toMatch(/^W-L-9-/);
    expect(CaseEventSchema.parse(event)).toEqual(event);
    expect(event).toMatchObject({
      type: 'case_opened',
      caseId: newCase.id,
      note: 'Opened from the watchlist: Rent 61–90 days; No insurance on file',
    });
  });

  it('chooses the issue type from the signals', () => {
    expect(buildOpenCase(lease, [insurance], ctx(maya)).newCase).toMatchObject({
      issueType: 'insurance',
      amountOwedAtNotice: null,
    });
    expect(buildOpenCase(lease, [listed], ctx(maya)).newCase.issueType).toBe('other_lease_term');
    expect(
      buildOpenCase({ ...lease, arBalance: null }, [rent], ctx(maya)).newCase.amountOwedAtNotice,
    ).toBeNull();
    expect(
      buildOpenCase({ ...lease, arBalance: 0 }, [rent], ctx(maya)).newCase.amountOwedAtNotice,
    ).toBeNull();
  });

  it('refuses anyone but Legal, and an empty reason', () => {
    expect(() => buildOpenCase(lease, [rent], ctx(lena))).toThrow(PermissionError);
    expect(() => buildOpenCase(lease, [rent], ctx(founder))).toThrow(PermissionError);
    expect(() => buildOpenCase(lease, [], ctx(maya))).toThrow(/nothing to open/);
  });
});
