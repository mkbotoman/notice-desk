import type { Case, CaseEvent } from '@/domain/types';

export function makeCase(over: Partial<Case> = {}): Case {
  return {
    id: 'N-1',
    leaseId: 'L-1',
    tenantId: 'T-1',
    propertyId: 'P-1',
    stage: 'notice_to_cure',
    issueType: 'monetary',
    dateSent: '2026-09-28',
    curePeriod: { kind: 'days', n: 10, unit: 'business' },
    owner: 'legal',
    amountOwedAtNotice: 100000,
    legalFeesTerms: null,
    lenderNotice: null,
    workflowStatus: null,
    courtCaseNo: null,
    guarantorName: null,
    hasGuarantor: false,
    ...over,
  };
}

let counter = 0;

/** A note event by default; pass `type` and `payload` for the others. */
export function makeEvent(over: Record<string, unknown> = {}): CaseEvent {
  counter += 1;
  return {
    id: `E-${counter}`,
    caseId: 'N-1',
    at: '2026-10-14T09:00:00.000Z',
    effectiveDate: '2026-10-14',
    actorPersonaId: 'maya',
    type: 'note',
    payload: {},
    ...over,
  } as CaseEvent;
}
