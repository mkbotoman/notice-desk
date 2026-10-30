import { describe, expect, it } from 'vitest';
import { COI_EXPIRING_DAYS, effectiveCoiStatus, isCoiProblem } from './coi';
import type { CoiRecord, CoiStatus } from './types';

const rec = (status: CoiStatus, expiresOn: string | null): CoiRecord => ({
  tenantId: 'T-1',
  propertyId: 'P-1',
  leaseIds: ['L-1'],
  status,
  expiresOn,
});
const asOf = '2026-10-13';

describe('effectiveCoiStatus', () => {
  it('derives valid, expiring and expired from the date, whatever the export said', () => {
    expect(effectiveCoiStatus(rec('valid', '2026-10-12'), asOf)).toBe('expired');
    expect(effectiveCoiStatus(rec('valid', '2026-10-13'), asOf)).toBe('expiring');
    expect(effectiveCoiStatus(rec('valid', '2026-11-12'), asOf)).toBe('expiring');
    expect(COI_EXPIRING_DAYS).toBe(30);
    expect(effectiveCoiStatus(rec('valid', '2026-11-13'), asOf)).toBe('valid');
    expect(effectiveCoiStatus(rec('expiring', '2027-03-01'), asOf)).toBe('valid');
  });

  it('moves with the asOf date', () => {
    const r = rec('valid', '2026-11-20');
    expect(effectiveCoiStatus(r, '2026-10-13')).toBe('valid');
    expect(effectiveCoiStatus(r, '2026-11-01')).toBe('expiring');
    expect(effectiveCoiStatus(r, '2026-12-01')).toBe('expired');
  });

  it('keeps statuses the date cannot change', () => {
    expect(effectiveCoiStatus(rec('non_compliant', '2027-01-01'), asOf)).toBe('non_compliant');
    expect(effectiveCoiStatus(rec('missing', null), asOf)).toBe('missing');
    expect(effectiveCoiStatus(rec('unknown', '2020-01-01'), asOf)).toBe('unknown');
  });

  it('keeps the recorded status when there is no expiry date', () => {
    expect(effectiveCoiStatus(rec('valid', null), asOf)).toBe('valid');
  });
});

describe('isCoiProblem', () => {
  it('counts expired, non-compliant and missing certificates', () => {
    expect(isCoiProblem('expired')).toBe(true);
    expect(isCoiProblem('non_compliant')).toBe(true);
    expect(isCoiProblem('missing')).toBe(true);
    expect(isCoiProblem('valid')).toBe(false);
    expect(isCoiProblem('expiring')).toBe(false);
    expect(isCoiProblem('unknown')).toBe(false);
  });
});
