import { describe, expect, it } from 'vitest';
import { can, inScope } from './permissions';
import { ACTIONS, type Case, type Persona } from './types';

const persona = (over: Partial<Persona>): Persona => ({
  id: 'p',
  label: 'p',
  kind: 'legal',
  personId: null,
  team: null,
  scopePropertyIds: 'all',
  ...over,
});

const legal = persona({ kind: 'legal', team: 'legal' });
const founder = persona({ kind: 'founder' });
const lena = persona({
  kind: 'asset_manager',
  team: 'asset_management',
  scopePropertyIds: ['P-01'],
});
const priya = persona({ kind: 'property_manager', scopePropertyIds: ['P-01'] });

const caseOf = (over: Partial<Case>): Case => ({
  id: 'N-1',
  leaseId: 'L-1',
  tenantId: 'T-1',
  propertyId: 'P-01',
  stage: 'notice_to_cure',
  issueType: 'monetary',
  dateSent: '2026-09-28',
  curePeriod: { kind: 'none' },
  owner: 'legal',
  amountOwedAtNotice: null,
  legalFees: null,
  lenderNoticeRequired: null,
  courtCaseNo: null,
  guarantorName: null,
  hasGuarantor: false,
  ...over,
});

describe('can', () => {
  it('lets Legal do everything, in or out of any scope', () => {
    for (const a of ACTIONS) expect(can(legal, a, caseOf({ propertyId: 'P-99' }))).toBe(true);
  });

  it('gives the founder read access, guarantors, analytics and data quality only', () => {
    const granted = ACTIONS.filter((a) => can(founder, a));
    expect(granted).toEqual(['view_case', 'view_guarantor', 'view_analytics', 'view_data_quality']);
  });

  it('gives a property manager view only, and only within scope', () => {
    expect(ACTIONS.filter((a) => can(priya, a))).toEqual(['view_case']);
    expect(can(priya, 'view_case', caseOf({ propertyId: 'P-01' }))).toBe(true);
    expect(can(priya, 'view_case', caseOf({ propertyId: 'P-02' }))).toBe(false);
  });

  it('lets an asset manager view and add updates within scope, but not outside it', () => {
    expect(can(lena, 'view_case', caseOf({}))).toBe(true);
    expect(can(lena, 'add_update', caseOf({}))).toBe(true);
    expect(can(lena, 'add_update', caseOf({ propertyId: 'P-02' }))).toBe(false);
  });

  it('denies an asset manager editing, advancing, notifying, guarantors and data quality', () => {
    for (const a of [
      'edit_case',
      'advance_stage',
      'send_notification',
      'view_guarantor',
      'view_data_quality',
    ] as const) {
      expect(can(lena, a)).toBe(false);
      expect(can(lena, a, caseOf({}))).toBe(false);
    }
  });

  it('lets an asset manager hand back to Legal only while the case is with asset management', () => {
    expect(can(lena, 'change_owner', caseOf({ owner: 'asset_management' }))).toBe(true);
    expect(can(lena, 'change_owner', caseOf({ owner: 'legal' }))).toBe(false);
    expect(
      can(lena, 'change_owner', caseOf({ owner: 'asset_management', propertyId: 'P-02' })),
    ).toBe(false);
  });

  it('keeps analytics available to an asset manager as a kind-level grant', () => {
    expect(can(lena, 'view_analytics')).toBe(true);
    expect(can(priya, 'view_analytics')).toBe(false);
  });

  it('hides orphan cases from scoped personas but not from "all" scope', () => {
    const orphan = caseOf({ leaseId: null, propertyId: null });
    expect(can(lena, 'view_case', orphan)).toBe(false);
    expect(can(legal, 'view_case', orphan)).toBe(true);
    expect(can(founder, 'view_case', orphan)).toBe(true);
  });
});

describe('inScope', () => {
  it('treats null property as out of scope for a scoped persona', () => {
    expect(inScope(lena, null)).toBe(false);
    expect(inScope(lena, 'P-01')).toBe(true);
    expect(inScope(legal, null)).toBe(true);
  });
});
